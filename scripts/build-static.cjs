'use strict';
const fs=require('node:fs');
fs.mkdirSync('public',{recursive:true});
for(const file of ['index.html','app.js','enhancements.js','planning.js','planning.css','avatar.webp','manifest.webmanifest','sw.js'])fs.copyFileSync(file,'public/'+file);

fs.mkdirSync('public/icons',{recursive:true});
for(const file of ['kylo-apple-180.png','kylo-192.png','kylo-512.png','kylo-favicon-32.png'])fs.copyFileSync('icons/'+file,'public/icons/'+file);
