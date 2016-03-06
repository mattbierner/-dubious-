"use strict";
const NodeMw = require('nodemw');
const striptags = require('striptags');
const regExpEscape = require('escape-regexp');

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
        .replace(/\[\[[^\]]+?\|(.+?)\]\]?/g, (match, content) => content)
        .replace(/\[\[([^\]]+?)\]\]/g, (match, content) => content)
    
    // other template
        .replace(/\{\{[^]+?\}\}/g, '')
    
    // ref tags
        .replace(/<ref .+?\/>/gi, '')
        .replace(/\n?<ref.*?>[^]*?<\/ref>/gi, '')
        .replace(/\n?<ref.*?>[^]*?<\/ref>/gi, '')
        .replace(/^[^]*?<\/ref>/gi, '')
        .replace(/\n?<ref.*?>[^]*?$/gi, '')
        
    // comment tags
        .replace(/<!--[^]+?-->/gi, '')
    
    // Markup
        .replace(/''/g, '')
        .replace(/""/g, '')
        .replace(/  /g, ' ');
        
const char_re = /[\w \.\(\),;:'";\-]/;

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
    let sample = text.substr(index - sampleSize, sampleSize);
    sample = removeLinks(sample);
    for (let i = sample.length - 1; i >= 0; --i) {
        const c = sample[i];
        if (!c.match(char_re))
            break;
        out.unshift(c);
    }
    return out.join('');
};

var forwardContext = (text, index) => {
    const out = [];
    const sampleSize = 500;
    let sample = text.substr(index, sampleSize);
    sample = removeLinks(sample);
    for (let i = 0; i < sample.length; ++i) {
        const c = sample[i];
        if (!c.match(char_re))
            break;
        out.push(c);
    }
    return out.join('');
};

const context = (text, match) => {
    let pre = reverseContext(text, match.index);
    let post = forwardContext(text, match.index + match[0].length);

    const matchLength = 50;
    pre = pre.length < matchLength ? pre : pre.substr(pre.length - matchLength);
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
 * Find titles of articles that use a given template. 
 */
exports.searchForTemplate = (client, templateName, start, count) =>
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
 * Clean up text for output.
 */
const normalizeOutput = text =>
    striptags(text)
        .trim()
        .replace(/^[^\w\*]+/g, '')
        .replace(/[^\w|)|\.\*]+$/g, '');

/**
 * Get all sentances for a given template's usage.
 */
exports.getTemplateUsages = (client, title, templateNames) =>
    getArticle(client, title).then(data => {
        const contexts = getContexts(title, templateNames, data);
        if (!contexts.length)
            return { title: title, usages: [] };

        return getArticleText(client, title).then(data => {
            data = normalizeOutput(data);
            const out = []
            for (let target of contexts) {
                const index = data.indexOf(target.pre + target.post);
                if (index === -1)
                    continue;
                const text = extractDubiousness(data, index - 1 + target.pre.length);
                out.push(normalizeOutput(text));
            }
            return { title: title, usages: out };
        })
    });
