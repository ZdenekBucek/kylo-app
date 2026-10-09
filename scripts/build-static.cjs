'use strict';
const fs=require('node:fs');
fs.mkdirSync('public',{recursive:true});
for(const file of ['index.html','app.js','enhancements.js','planning.js','planning.css','avatar.webp','manifest.webmanifest','sw.js'])fs.copyFileSync(file,'public/'+file);
