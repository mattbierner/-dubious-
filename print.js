"use strict";
const NodeMw = require('nodemw');
const Datastore = require('nedb');
const path = require('path');
const process = require('process');

const ROOT = path.join(__dirname, 'out');

const DB_FILE = "data.db";
const STATE_FILE = 'state.json';


const printArticle = (data) => {
    if (!data.usages.length)
        return;
    console.log('');
    console.log(`=====${data.article}=====`);
    for (let usage of data.usages)
        console.log('- ' + usage);
};



const template = process.argv[2];
if (!template) {
    console.error('no template specified');
    process.exit(1);
}
console.log('Template:', template)

const db = new Datastore({
    filename: path.join(ROOT, template, DB_FILE),
    autoload: true
});

db.find({}, (err, docs) => {
    docs.map(printArticle)
});