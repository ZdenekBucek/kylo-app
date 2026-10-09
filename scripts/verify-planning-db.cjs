// Run against an isolated Neon branch only; never point this test at production.
'use strict';
const assert=require('node:assert/strict'),{neon}=require('@neondatabase/serverless'),{randomBytes,randomUUID,createHash}=require('node:crypto');
if(!process.env.KYLO_TEST_BRANCH_ID||!process.env.DATABASE_URL||process.env.KYLO_TEST_BRANCH_ID==='br-frosty-cloud-b24au899')throw Error('An isolated test branch is required');
const db=neon(process.env.DATABASE_URL),handlers={actions:require('../api/actions'),care:require('../api/care'),index:require('../api/index')};
const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex'),username='planning-'+randomUUID().slice(0,8);
async function invoke(handler,action,body={},method='POST'){
 const req={method,query:{action},headers:{host:'kylo.test','content-type':'application/json',cookie:'kylo_session='+token},body};
 const res={code:200,body:null,status(s){this.code=s;return this},setHeader(){return this},json(b){this.body=b;return this}};
 await handlers[handler](req,res);return res;
}
(async()=>{
 const baseline=(await db.query('SELECT (SELECT count(*)::int FROM care_records) records,(SELECT count(*)::int FROM planned_events) plans'))[0];
 const [user]=await db.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,'unused-test-hash','Isolated planning verification','admin') RETURNING id",[username]);
 await db.query("INSERT INTO user_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[user.id,hash]);
 let r=await invoke('actions','',{name:'Branch test action',dose:'2 kapky',intervalDays:21,reminderOffsets:[5,0]});assert.equal(r.code,201);const typeId=r.body.id;
 r=await invoke('care','plan',{careTypeId:typeId,date:'2026-10-20',name:'Branch test action',dose:'2 kapky',intervalDays:21,reminderOffsets:[5,0],notes:'Branch only'});assert.equal(r.code,201);const planId=r.body.id;
 const [plan]=await db.query('SELECT title,dose,interval_days,reminder_offsets FROM planned_events WHERE id=$1',[planId]);assert.deepEqual(plan,{title:'Branch test action',dose:'2 kapky',interval_days:21,reminder_offsets:[5,0]});
 r=await invoke('index','state',{},'GET');assert.equal(r.code,200);assert.ok(r.body.plans.find(p=>p.id===planId));assert.ok(r.body.types.find(t=>t.id===typeId));
 // Changing the definition must not retroactively modify an existing plan.
 r=await invoke('actions','',{id:typeId,name:'Edited test action',dose:'1 kapka',intervalDays:7,reminderOffsets:[1]},'PUT');assert.equal(r.code,200);
 const outcomes=await Promise.all([invoke('care','complete',{id:planId,date:'2026-10-20'}),invoke('care','complete',{id:planId,date:'2026-10-20'})]);assert.deepEqual(outcomes.map(r=>r.code).sort(),[200,409]);
 const rows=await db.query('SELECT dose,next_due_on::text,reminder_offsets FROM care_records WHERE care_type_id=$1',[typeId]);assert.equal(rows.length,1);assert.deepEqual(rows[0],{dose:'2 kapky',next_due_on:'2026-11-10',reminder_offsets:[5,0]});
 // Explicit no-repeat and no-reminder settings override the action defaults.
 r=await invoke('care','plan',{careTypeId:typeId,date:'2026-11-01',name:'One off',dose:'',intervalDays:0,reminderOffsets:[]});assert.equal(r.code,201);const once=r.body.id;
 r=await invoke('care','complete',{id:once,date:'2026-11-01'});assert.equal(r.code,200);
 const [one]=await db.query("SELECT next_due_on,reminder_offsets FROM care_records WHERE care_type_id=$1 AND event_date='2026-11-01'",[typeId]);assert.equal(one.next_due_on,null);assert.deepEqual(one.reminder_offsets,[]);
 const [after]=await db.query('SELECT (SELECT count(*)::int FROM care_records) records,(SELECT count(*)::int FROM planned_events) plans');assert.equal(after.records,baseline.records+2);assert.equal(after.plans,baseline.plans+2);
 console.log('PASS: real database action CRUD, state, immutable plan defaults, atomic completion, recurrence, one-off and original record counts.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
