'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
test('all frontend assets parse',()=>{for(const file of ['app.js','enhancements.js','planning.js','ui.js','sw.js'])assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file}))});
test('PWA manifest supports standalone mode',()=>{const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));assert.equal(m.display,'standalone');assert.equal(m.start_url,'/')});
test('all primary screens and controls exist',()=>{const h=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const id of ['home','history','calendar','profile','weightCard','historyRows','monthRows','profileUsername'])assert.ok(h.includes("id='"+id+"'"),id)});
test('UI enhancements script is loaded by page',()=>{const h=fs.readFileSync(path.join(root,'index.html'),'utf8');assert.ok(h.includes("src='/enhancements.js'"))});
test('public assets do not embed database connection strings',()=>{for(const file of ['app.js','enhancements.js','planning.js','index.html','sw.js'])assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),/postgres(?:ql)?:\/\/\S+/i)});
test('service worker handles push and notification click',()=>{const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');assert.match(sw,/addEventListener\('push'/);assert.match(sw,/addEventListener\('notificationclick'/)});
