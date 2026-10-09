'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
process.env.DATABASE_URL='postgres://test.invalid/db';process.env.CRON_SECRET='test-secret';process.env.VAPID_PUBLIC_KEY='test-public';process.env.VAPID_PRIVATE_KEY='test-private';
const ID='11111111-1111-4111-8111-111111111111',REC='22222222-2222-4222-8222-222222222222';let role='admin',calls=[],archiveFound=true;
const db={query:async(sql,args=[])=>{calls.push({sql,args});if(sql.includes('FROM user_sessions'))return role==='guest'?[]:[{id:ID,username:'owner',role}];if(sql.includes('UPDATE care_types SET is_active=false'))return archiveFound?[{id:REC}]:[];if(sql.includes('INSERT INTO care_types')||sql.includes('UPDATE care_types')||sql.includes('INSERT INTO planned_events'))return [{id:REC}];if(sql.includes('FROM care_types WHERE id='))return [{id:REC,slug:'custom-test'}];if(sql.includes('WITH source AS'))return [{done:REC}];if(sql.includes('FROM care_types WHERE slug='))return [{id:REC,slug:args[0]}];if(sql.includes('UPDATE care_records'))return [{id:REC}];if(sql.includes('DELETE FROM care_records'))return [{id:REC}];if(sql.includes('FROM care_types ORDER'))return [{slug:'weight',name:'Vážení'}];if(sql.includes('FROM care_records r JOIN'))return [{slug:'weight',event_date:'2026-10-01',weight_kg:7.6}];if(sql.includes('FROM planned_events p LEFT'))return [];if(sql.includes('FROM user_notification_settings WHERE'))return [];return []}};
const fakePush={setVapidDetails(){},sendNotification:async()=>({statusCode:201})};
const original=Module._load;Module._load=function(name,...rest){if(name==='@neondatabase/serverless')return{neon:()=>db};if(name==='web-push')return fakePush;return original.call(this,name,...rest)};
const handlers={actions:require('../api/actions.js'),care:require('../api/care.js'),backup:require('../api/backup.js'),settings:require('../api/settings.js'),push:require('../api/push.js'),cron:require('../api/cron.js')};Module._load=original;
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

const actionBody={name:'Péče o srst',dose:'2 kapky',intervalDays:21,reminderOffsets:[5,0]};
test('only administrators can create action definitions',async()=>{for(const [as,status] of [['guest',401],['user',403]]){role=as;assert.equal((await invoke('actions','POST','',actionBody)).code,status);assert.ok(!calls.some(x=>x.sql.includes('INSERT INTO care_types')))}});
test('action definitions reject invalid recurrence and reminders',async()=>{role='admin';for(const extra of [{name:' '},{intervalDays:-1},{intervalDays:1.5},{reminderOffsets:[366]},{reminderOffsets:['1']},{dose:'a'.repeat(201)}]){assert.equal((await invoke('actions','POST','',{...actionBody,...extra})).code,400)}});
test('action definitions are saved with parameterized values',async()=>{role='admin';const result=await invoke('actions','POST','',actionBody);assert.equal(result.code,201);const write=calls.find(x=>x.sql.includes('INSERT INTO care_types'));assert.equal(write.args[1],'Péče o srst');assert.deepEqual(write.args.slice(2,5),['2 kapky',21,[5,0]])});
test('users can plan an active action with their chosen dose and interval',async()=>{role='user';const result=await invoke('care','POST','plan',{...actionBody,date:'2026-10-20',careTypeId:REC});assert.equal(result.code,201);const write=calls.find(x=>x.sql.includes('INSERT INTO planned_events'));assert.deepEqual(write.args.slice(0,6),[REC,'Péče o srst','2026-10-20','2 kapky',21,[5,0]])});
test('planning rejects impossible dates and malformed IDs',async()=>{role='admin';for(const extra of [{date:'2026-02-30'},{careTypeId:'------------------------------------'},{reminderOffsets:[-1]}]){assert.equal((await invoke('care','POST','plan',{...actionBody,date:'2026-10-20',careTypeId:REC,...extra})).code,400)}});
test('action settings reject foreign origins and non-JSON payloads',async()=>{role='admin';assert.equal((await invoke('actions','POST','',actionBody,{origin:'https://evil.test'})).code,403);assert.equal((await invoke('actions','POST','',actionBody,{'content-type':'text/plain'})).code,415)});

test('action removal requires authentication and administrator access',async()=>{for(const [as,status] of [['guest',401],['user',403]]){role=as;assert.equal((await invoke('actions','DELETE','',{id:REC})).code,status);assert.ok(!calls.some(x=>x.sql.includes('UPDATE care_types')))}});
test('removal validates IDs, origin and content type before changing action definitions',async()=>{role='admin';assert.equal((await invoke('actions','DELETE','',{id:'bad'})).code,400);assert.equal((await invoke('actions','DELETE','',{id:REC},{origin:'https://evil.test'})).code,403);assert.equal((await invoke('actions','DELETE','',{id:REC},{'content-type':'text/plain'})).code,415)});
test('removing an action archives its definition without deleting care data or plans',async()=>{role='admin';archiveFound=true;assert.equal((await invoke('actions','DELETE','',{id:REC})).code,200);const write=calls.find(x=>x.sql.includes('UPDATE care_types SET is_active=false'));assert.deepEqual(write.args,[REC]);assert.ok(!write.sql.includes('slug LIKE'));assert.match(write.sql,/is_active=true/);assert.ok(!calls.some(x=>/DELETE FROM|UPDATE planned_events|UPDATE care_records/.test(x.sql)))});
test('missing and already removed actions cannot be removed',async()=>{role='admin';archiveFound=false;assert.equal((await invoke('actions','DELETE','',{id:REC})).code,404);archiveFound=true});
