"use strict";
const NodeMw = require('nodemw');
const Datastore = require('nedb');
const wiki = require('./wiki');
const path = require('path');
const mkdirp = require('mkdirp');
const fs = require('fs');
const process = require('process');

const ROOT = path.join(__dirname, 'out');

const DB_FILE = "data.db";
const STATE_FILE = 'state.json';

const DEFAULT_STATE = {
    start: 0,
    count: 20
};

const load_inital_state = (root) => {
    let data;
    try {
        data = fs.readFileSync(path.join(root, STATE_FILE));
    } catch (e) {
        //noop
    }
    if (data) {
        const state = JSON.parse(data);
        if (state)
            return Object.assign({}, DEFAULT_STATE, state);
    }
    return DEFAULT_STATE;
};

const save_state = (root, start, count) => {
    const data = JSON.stringify({
        start: start,
        count: count
    });
    fs.writeFileSync(path.join(root, STATE_FILE), data);
};

const writeResults = (db, results) =>
    Promise.all(
        results.filter(x => x).map(result =>
            new Promise((resolve, reject) =>
                db.update({ 'article': result.title }, {
                    'article': result.title,
                    'usages': result.usages,
                    'date': Date.now()
                }, { upsert: true }, err => err ? reject(err) : resolve()))));

/**
 * 
 */
const getResults = (client, name, templateNames, start, count) =>
    wiki.searchForTemplate(client, name, start, count)
        .then(results =>
            Promise.all(results.map(title => wiki.getTemplateUsages(client, title, templateNames))))


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


// template to find.
let template = process.argv[2];
if (!template) {
    console.error('no template specified');
    process.exit(1);
}
console.log('Template:', template)

let aliases = templateAliases[template];
if (!aliases) {
    console.warn('No template aliases found, only using template name');
    aliases = [template];
}

const output_dir = path.join(ROOT, template);
mkdirp.sync(output_dir);

const db = new Datastore({
    filename: path.join(output_dir, DB_FILE),
    autoload: true
});

const client = new NodeMw({
    server: 'en.wikipedia.org',
    path: '/w'
});

const begin = () => {
    const state = load_inital_state(output_dir);
    getResults(client, template, templateAliases[template], state.start, state.count)
        .then(x => { console.log(x); return x; })
        .catch(err => { console.error(err); return []; })
        .then(results =>
            writeResults(db, results).then(_ => results))
        .then(results => {
            save_state(output_dir, state.start + state.count, state.count);
            if (results.length)
                setTimeout(begin, 30000);
        })
        .catch(console.error);
};

if (true) {
    begin();
} else {
    wiki.getTemplateUsages(client, 'Blue whale', templateAliases[template])
        .then(console.log)
        .catch(console.error);
}