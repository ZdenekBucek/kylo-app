'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
process.env.DATABASE_URL='postgres://test.invalid/db';process.env.CRON_SECRET='test-secret';process.env.VAPID_PUBLIC_KEY='test-public';process.env.VAPID_PRIVATE_KEY='test-private';
const ID='11111111-1111-4111-8111-111111111111',REC='22222222-2222-4222-8222-222222222222';let role='admin',calls=[];
const db={query:async(sql,args=[])=>{calls.push({sql,args});if(sql.includes('FROM user_sessions'))return role==='guest'?[]:[{id:ID,username:'owner',role}];if(sql.includes('WITH source AS'))return [{done:REC}];if(sql.includes('FROM care_types WHERE slug='))return [{id:REC,slug:args[0]}];if(sql.includes('UPDATE care_records'))return [{id:REC}];if(sql.includes('DELETE FROM care_records'))return [{id:REC}];if(sql.includes('FROM care_types ORDER'))return [{slug:'weight',name:'Vážení'}];if(sql.includes('FROM care_records r JOIN'))return [{slug:'weight',event_date:'2026-10-01',weight_kg:7.6}];if(sql.includes('FROM planned_events p LEFT'))return [];if(sql.includes('FROM user_notification_settings WHERE'))return [];return []}};
const fakePush={setVapidDetails(){},sendNotification:async()=>({statusCode:201})};
const original=Module._load;Module._load=function(name,...rest){if(name==='@neondatabase/serverless')return{neon:()=>db};if(name==='web-push')return fakePush;return original.call(this,name,...rest)};
const handlers={care:require('../api/care.js'),backup:require('../api/backup.js'),settings:require('../api/settings.js'),push:require('../api/push.js'),cron:require('../api/cron.js')};Module._load=original;
function request(method='GET',action='',body={},headers={}){return{method,query:{action},body,headers:{host:'kylo.test','content-type':'application/json',cookie:role==='guest'?'':'kylo_session='+'a'.repeat(64),...headers}}}
function response(){return{code:200,body:null,headers:{},status(x){this.code=x;return this},setHeader(k,v){this.headers[k.toLowerCase()]=v;return this},json(x){this.body=x;return this}}}
async function invoke(which,method='GET',action='',body={},headers={}){calls=[];const r=response();await handlers[which](request(method,action,body,headers),r);return r}
const invalid=[
 ['unauthenticated care update','guest','care','PUT','record',{id:REC,date:'2026-10-08'},401],
 ['unauthenticated backup','guest','backup','GET','',{},401],
 ['non-admin backup','user','backup','GET','',{},403],
 ['unauthenticated settings','guest','settings','GET','',{},401],
 ['unauthenticated push subscription','guest','push','POST','subscribe',{subscription:{}},401],
 ['bad record id','admin','care','PUT','record',{id:'bad',date:'2026-10-08'},400],
 ['bad record date','admin','care','PUT','record',{id:REC,date:'wrong'},400],
 ['negative weight','admin','care','PUT','record',{id:REC,date:'2026-10-08',type:'weight',weight:-2},400],
 ['missing weight','admin','care','PUT','record',{id:REC,date:'2026-10-08',type:'weight',weight:null},400],
 ['missing delete id','admin','care','DELETE','record',{},400],
 ['bad completion date','admin','care','POST','complete',{id:REC,date:'tomorrow'},400],
 ['invalid notification time','admin','settings','POST','',{enabled:true,repeatOverdue:true,preferredTime:'26:90',reminders:{}},400],
 ['malformed push subscription','admin','push','POST','subscribe',{subscription:{endpoint:'http://insecure.example',keys:{}}},400],
 ['cron without secret','admin','cron','GET','',{},401],
 ['cron disallows POST','admin','cron','POST','',{},405]
];
for(const [name,as,which,method,action,body,status] of invalid)test(name,async()=>{role=as;assert.equal((await invoke(which,method,action,body)).code,status)});
test('cross-origin writes are denied',async()=>{role='admin';assert.equal((await invoke('care','PUT','record',{}, {origin:'https://evil.example'})).code,403)});
test('non-JSON writes are denied',async()=>{role='admin';assert.equal((await invoke('care','PUT','record',{}, {'content-type':'text/plain'})).code,415)});
test('valid weighing updates database',async()=>{role='admin';const r=await invoke('care','PUT','record',{id:REC,date:'2026-10-08',type:'weight',weight:7.5,product:'Vážení'});assert.equal(r.code,200);assert.equal(calls.find(x=>x.sql.includes('UPDATE care_records')).args[4],7.5)});
test('record deletion persists',async()=>{role='admin';assert.equal((await invoke('care','DELETE','record',{id:REC})).code,200);assert.ok(calls.some(x=>x.sql.includes('DELETE FROM care_records')))});
test('planned event completion writes record and closes event',async()=>{role='admin';const r=await invoke('care','POST','complete',{id:REC,date:'2026-10-08',product:'Vet',notes:''});assert.equal(r.code,200);assert.ok(calls.some(x=>x.sql.includes('WITH source AS')))});
test('admin backup includes care records but not credentials',async()=>{role='admin';const r=await invoke('backup','GET');assert.equal(r.code,200);assert.equal(r.body.format,'kylo-care-backup');assert.ok(Array.isArray(r.body.records));assert.match(r.headers['content-disposition'],/\.json/);assert.doesNotMatch(JSON.stringify(r.body),/password_hash/)});
test('notification defaults include flea prevention',async()=>{role='admin';const r=await invoke('settings','GET');assert.equal(r.code,200);assert.deepEqual(r.body.reminders['fleas-ticks'],[3,1,0])});
test('valid notification settings saved',async()=>{role='admin';const r=await invoke('settings','POST','',{enabled:true,repeatOverdue:false,preferredTime:'09:00',reminders:{weight:[7,1,0]}});assert.equal(r.code,200);assert.ok(calls.some(x=>x.sql.includes('INSERT INTO user_notification_settings')))});
test('VAPID public key available',async()=>{role='guest';const r=await invoke('push','GET','public-key');assert.equal(r.code,200);assert.equal(r.body.publicKey,'test-public')});
