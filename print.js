"use strict";
const NodeMw = require('nodemw');
const Datastore = require('nedb');
const path = require('path');
const process = require('process');

const ROOT = path.join(__dirname, 'out');

const DB_FILE = "data.db";
const STATE_FILE = 'state.json';


const printArticle = (template, data) => {
    if (!data.usages.length)
        return;
    const title = data.article;
    const pagePath = 'https://en.wikipedia.org/wiki/' + encodeURI(title.replace(/ /g, '_'));
    
    console.log('');
    console.log(`#### <a href="${pagePath}">${title}</a>`);
    for (let usage of data.usages) {
        if (usage.length)
            console.log('- ' + usage.replace('*', x => `<sup>[${template}]</sup>`));
    }
};

const template = process.argv[2];
if (!template) {
    console.error('no template specified');
    process.exit(1);
}
console.log('# ', template)
console.log('Orded by number of occurrences.');

const db = new Datastore({
    filename: path.join(ROOT, template, DB_FILE),
    autoload: true
});

db.find({}, (err, docs) => {
    docs
        .filter(x => x.usages.length)
        .sort((a, b) => b.usages.length - a.usages.length)
        .map(x => printArticle(template, x));
});