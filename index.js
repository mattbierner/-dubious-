"use strict";
const NodeMw = require('nodemw');
const striptags = require('striptags');
const regExpEscape = require('escape-regexp');
const Datastore = require('nedb');

const MIX_CONTEXT_LENGTH = 20;

/**
 * Create a regular expression that matches uses of a set of templates.
 */
const createTemplateRe = templateNames =>
    new RegExp(`\{\{(${templateNames.map(regExpEscape).join('|') })[^]*?\}\}`, 'gi');

/**
 * Try to remove links from wikimarkup.
 */
const removeLinks = markup =>
    markup
        .replace(/\[\[(.+?)\]\]/g, (match, content) => content)
        .replace(/\[\[(.+?)\|(.+?)\]/g, (match, content) => content)
    // ref tags
        .replace(/\n?<ref.*?>[^]+?(<\/ref>|$)/gi, '')
        .replace(/(^|\n?<ref.*?>)[^]+?<\/ref>/gi, '')
    // comment tags
        .replace(/<!--[^]*?-->/gi, '');

/**
 * Try to extract a string matching context around a dubious tag.
 * 
 * Wikimedia doesn't actually mark what the dubious part of a statement is, and these
 * tags get stripped out from the plaintext. The context tries to find some text around
 * the dubious statement using the markup, which can be later matched against the
 * plaintext.
 */
const reverseContext = (text, index) => {
    const out = [];
    const sampleSize = 500;
    const sample = removeLinks(text.substr(index - sampleSize, sampleSize));
    for (let i = sample.length - 1; i >= 0; --i) {
        const c = sample[i];
        if (!c.match(/[\w \.\(\),;'";]/))
            break;
        out.unshift(c);
    }
    return out.join('');
};

var forwardContext = (text, index) => {
    const out = [];
    const sampleSize = 500;
    const sample = removeLinks(text.substr(index, sampleSize));
    for (let i = 0; i < sample.length; ++i) {
        const c = sample[i];
        if (!c.match(/[\w \.\(\),;'";]/))
            break;
        out.push(c);
    }
    return out.join('');
};

const context = (text, match) => {
    let pre = reverseContext(text, match.index);
    let post = forwardContext(text, match.index + match[0].length);

    const matchLength = 50;
    pre = pre.substr(Math.min(matchLength, pre.length));
    post = post.substr(0, Math.min(matchLength, post.length));
    return {
        pre: pre,
        post: post,
        length: pre.length + post.length
    };
};

/**
 *  
 */
const extractDubiousness = (text, index) => {
    const out = [];
    let last;
    let inSentance = false;
    // Extract the leading part of the sentance.
    for (let i = index; i >= 0; --i) {
        const c = text[i];
        if (c === '\n')
            break;
        if (c === '.' && last === ' ') {
            if (inSentance)
                break;
            inSentance = true;
        }
        inSentance = inSentance || c.match(/\w/);
        out.unshift(c);
        last = c;
    }
    if (out.length === 0)
        return '';

    out.push('*');
    // If in the middle of a sentence, try extracting the rest.
    if (text[index] !== '.' && text[index - 1] !== '.') {
        for (let i = index + 1; i < text.length; ++i) {
            const c = text[i];
            if (c === '\n')
                break;
            if (c === '.') {
                out.push(c);
                break;
            }
            out.push(c);
        }
    }
    return out.join('');
};

/**
 * Clean up text for output.
 */
const normalizeOutput = text =>
    striptags(text)
        .trim()
        .replace(/^[^\w\*]+/g, '')
        .replace(/[^\w|)|\.\*]+$/g, '');

/**
 * Find titles of articles that use a given template. 
 */
const searchForTemplate = (client, templateName, start, count) =>
    new Promise((resolve, reject) =>
        client.api.call({
            action: 'query',
            format: 'json',
            list: 'search',
            srsearch: `hastemplate:"${templateName}"`,
            sroffset: start,
            srlimit: count
        }, (err, data) => {
            if (err)
                return reject(err);
            if (!data || !data.search)
                return reject('No data returned');
            return resolve(data.search.map(x => x.title));
        }));

/**
 * Get the wiki markup content of an article
 */
const getArticle = (client, title) =>
    new Promise((resolve, reject) =>
        client.getArticle(title, (err, data) => {
            if (err)
                return reject(err);
            return resolve(data);
        }));

/**
 * Try to extract the text contexts of a set of template usages.
 */
const getContexts = (title, templateNames, content) => {
    const out = [];
    const re = createTemplateRe(templateNames);
    let m;
    while (m = re.exec(content)) {
        const target = context(content, m);
        if (target.length > MIX_CONTEXT_LENGTH)
            out.push(target);
    }
    return out;
};

/**
 * Get a text representation of a rendered article.
 */
const getArticleText = (client, title) =>
    new Promise((resolve, reject) =>
        client.api.call({
            action: 'query',
            prop: 'extracts',
            rvprop: 'content',
            titles: title
        }, (err, data) => {
            if (err)
                return reject(err);

            const pages = data && data.pages;
            if (!pages)
                return reject('no page');

            const page = Object.keys(pages)[0];
            if (!page)
                return reject('no page');

            return resolve(pages[page].extract);
        }));

/**
 * Get all sentances for a given template's usage.
 */
var getTemplateUsages = (client, title, templateNames) =>
    getArticle(client, title).then(data => {
        const contexts = getContexts(title, templateNames, data);
        if (!contexts.length)
            return null;

        return getArticleText(client, title).then(data => {
            const out = []
            for (let target of contexts) {
                const index = data.indexOf(target.pre + target.post);
                if (index === -1)
                    continue;
                const text = extractDubiousness(data, index - 1 + target.pre.length);
                out.push(normalizeOutput(text));
            }
            if (!out.length)
                return null;
            return { title: title, usages: out };
        })
    });

/**
 * 
 */
const begin = (client, name, templateNames, start, count) =>
    searchForTemplate(client, name, start, count)
        .then(results =>
            Promise.all(results.map(title => getTemplateUsages(client, title, templateNames))))
        .then(console.log)
        .catch(console.error);

const client = new NodeMw({
    server: 'en.wikipedia.org',
    path: '/w',
    //debug: true
});

const db = new Datastore({ filename: 'path/to/datafile' });

const templateAliases = {
    // dubious
    'dubious': ['doubtful', 'dubious'],
    
    // Missing or problematic reference
    'citation needed': ['Facts', 'Citeneeded', 'Citationneeded', 'Cite needed', 'Cite-needed', 'Citation required', 'Uncited', 'Cn', 'Needs citation', 'Reference needed', 'Citation-needed', 'Sourceme', 'Cb', 'Refneeded', 'Source needed', 'Citation missing', 'FACT', 'Cite missing', 'Citation Needed', 'Proveit', 'CN', 'Source?', 'Fact', 'Refplease', 'Needcite', 'Needsref', 'Ref?', 'Citationeeded', 'Are you sure?', 'Citesource', 'Cite source', 'Citation requested', 'Needs citations', 'Fcitation needed', 'Need sources', 'Request citation', 'Citation Requested', 'Request Citation', 'Prove it', 'Ctn', 'Citation need', 'PROV-statement', 'Ciation needed', 'Cn/sandbox', 'Cit', 'Unsourced-inline', 'Ref-needed', 'Fact?', 'Need Citation', 'CitationNeeded'],

    // Clarity
    'non sequitur': ['non sequitur'],
    'clarify': ['clarify'],
    'vauge': ['vauge'],
    'elucidate': ['elucidate'],

    // Neutrality
    'weasel-inline': ['weasel-inline'],
    'peacock-term': ['peacock-term', 'peacock-inline', 'peacock inline', 'Really?'],
    'loaded term': ['Loaded term', 'loaded inline', 'loaded-term', 'How dare you?!'],
    'lopsided': ['Lopsided'], // unbalanced opinion
    
    // Precision
    'who': ['who'],
    'which': ['which'],
    'why': ['why'],
    'how': ['how'],
    
    // wording
    'buzz': ['buzz'],
    'technical': ['technical']
};

const template = 'lopsided';

begin(client, template, templateAliases[template], 0, 20)