'use strict';
const fs=require('node:fs');
fs.mkdirSync('public',{recursive:true});
for(const file of ['index.html','app.js','enhancements.js','planning.js','planning.css','ui.js','redesign.css','documents.css','documents.js','avatar.webp','manifest.webmanifest','sw.js'])fs.copyFileSync(file,'public/'+file);

fs.mkdirSync('public/icons',{recursive:true});
for(const file of ['kylo-apple-180.png','kylo-192.png','kylo-512.png','kylo-favicon-32.png'])fs.copyFileSync('icons/'+file,'public/icons/'+file);

fs.mkdirSync('public/pdfjs', {recursive:true});
for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  fs.copyFileSync('node_modules/pdfjs-dist/legacy/build/'+name, 'public/pdfjs/'+name);
}
for (const dir of ['standard_fonts', 'cmaps', 'wasm', 'iccs']) {
  fs.cpSync('node_modules/pdfjs-dist/'+dir, 'public/pdfjs/'+dir, {recursive:true});
}
fs.copyFileSync('node_modules/pdfjs-dist/LICENSE', 'public/pdfjs/LICENSE');
