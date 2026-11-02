'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const ID='11111111-1111-4111-8111-111111111111',SOURCE='22222222-2222-4222-8222-222222222222';
let calls=[],role='user',slug='fleas-ticks',active=true;
const original=Module._load;
Module._load=function(name,...args){if(name==='@neondatabase/serverless')return {neon:()=>({query:async(sql,args=[])=>{
 calls.push({sql,args});if(sql.includes('FROM user_sessions'))return role==='guest'?[]:[{id:ID,role}];
 if(sql.startsWith('SELECT t.slug'))return [{slug,event_date:'2026-09-26'}];
 if(sql.startsWith('INSERT INTO care_records'))return active?[{id:ID,next_due_on:'2026-12-04'}]:[];
 return [];
}})};return original.call(this,name,...args)};
const handler=require('../api/care');Module._load=original;
async function complete(body,headers={}){calls=[];const res={status(n){this.code=n;return this},setHeader(){return this},json(b){this.body=b;return this}};await handler({method:'POST',query:{action:'complete'},headers:{host:'kylo.test','content-type':'application/json',cookie:role==='guest'?'':'kylo_session='+'a'.repeat(64),...headers},body},res);return res}
test('recurring completion uses actual date, original interval, dose and reminders on the server',async()=>{
 const r=await complete({sourceRecordId:SOURCE,date:'2026-10-30',dose:'1 pipeta'});assert.equal(r.code,200);
 const write=calls.find(c=>c.sql.startsWith('INSERT INTO care_records'));assert.equal(write.args[0],SOURCE);assert.equal(write.args[1],'2026-10-30');assert.equal(write.args[5],'1 pipeta');
 assert.match(write.sql,/\$2::date\+\(s.next_due_on-s.event_date\)/);assert.match(write.sql,/s.reminder_offsets/);
 assert.match(write.sql,/ON CONFLICT\(source_record_id\) DO NOTHING/);assert.match(write.sql,/latest.event_date DESC,latest.created_at DESC/);
 assert.ok(!calls.some(c=>/UPDATE care_records|DELETE FROM/.test(c.sql)));
});
test('missing and already completed recurrences return conflict',async()=>{active=false;assert.equal((await complete({sourceRecordId:SOURCE,date:'2026-10-30'})).code,409);active=true});
test('recurrence completion rejects malformed dates, IDs and ambiguous sources',async()=>{for(const b of [{sourceRecordId:'bad',date:'2026-10-30'},{sourceRecordId:SOURCE,date:'2026-02-30'},{sourceRecordId:SOURCE,id:ID,date:'2026-10-30'},{id:ID,date:'bad'}]){assert.equal((await complete(b)).code,400);assert.ok(!calls.some(c=>c.sql.startsWith('INSERT')))}});
test('actual date cannot precede previous care',async()=>{assert.equal((await complete({sourceRecordId:SOURCE,date:'2026-09-25'})).code,400)});
test('weight recurrences require a valid weighing',async()=>{slug='weight';for(const weight of [null,0,-1,101,'invalid'])assert.equal((await complete({sourceRecordId:SOURCE,date:'2026-10-30',weight})).code,400);assert.equal((await complete({sourceRecordId:SOURCE,date:'2026-10-30',weight:7.6})).code,200);slug='fleas-ticks'});
test('recurrence completion requires a session and rejects foreign origins',async()=>{role='guest';assert.equal((await complete({sourceRecordId:SOURCE,date:'2026-10-30'})).code,401);role='user';assert.equal((await complete({sourceRecordId:SOURCE,date:'2026-10-30'},{origin:'https://foreign.test'})).code,403)});
