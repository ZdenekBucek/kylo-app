// Explicitly run only against the isolated planning test branch.
'use strict';
const assert=require('node:assert/strict'),{neon}=require('@neondatabase/serverless'),{randomUUID,randomBytes,createHash}=require('node:crypto');
if(process.env.KYLO_TEST_BRANCH_ID!=='br-raspy-unit-b2uubftz'||!process.env.DATABASE_URL)throw Error('The isolated test branch is required');
const db=neon(process.env.DATABASE_URL),handlers={actions:require('../api/actions'),care:require('../api/care'),index:require('../api/index')},token=randomBytes(32).toString('hex');
async function call(handler,action,body={},method='POST'){const res={code:200,status(n){this.code=n;return this},setHeader(){return this},json(value){this.body=value;return this}};await handlers[handler]({method,query:{action},headers:{host:'kylo.test','content-type':'application/json',cookie:'kylo_session='+token},body},res);return res}
(async()=>{
 const [user]=await db.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,'unused-test-hash','Removal verification','admin') RETURNING id",['removal-'+randomUUID().slice(0,8)]);
 await db.query("INSERT INTO user_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[user.id,createHash('sha256').update(token).digest('hex')]);
 let r=await call('actions','',{name:'Isolated removal test',dose:'sample',intervalDays:7,reminderOffsets:[1,0]});assert.equal(r.code,201);const id=r.body.id;
 const [type]=await db.query('SELECT id,slug FROM care_types WHERE id=$1',[id]);
 r=await call('index','record',{type:type.slug,date:'2026-10-01',product:'Isolated record',dose:'sample',nextDue:'2026-10-08'});assert.equal(r.code,201);const recordId=r.body.id;
 r=await call('care','plan',{careTypeId:id,date:'2026-10-20',name:'Isolated plan',dose:'sample',intervalDays:7,reminderOffsets:[1,0]});assert.equal(r.code,201);const planId=r.body.id;
 const before=await db.query('SELECT to_jsonb(r) AS row FROM care_records r WHERE id=$1',[recordId]);
 r=await call('actions','',{id},'DELETE');assert.equal(r.code,200);
 const [archived]=await db.query('SELECT is_active FROM care_types WHERE id=$1',[id]);assert.equal(archived.is_active,false);
 assert.deepEqual(await db.query('SELECT to_jsonb(r) AS row FROM care_records r WHERE id=$1',[recordId]),before);
 r=await call('index','state',{},'GET');assert.equal(r.code,200);assert.ok(!r.body.types.some(t=>t.id===id));assert.ok(r.body.records.some(t=>t.id===recordId));assert.ok(r.body.plans.some(t=>t.id===planId));
 r=await call('care','record',{id:recordId,type:type.slug,date:'2026-10-01',product:'Isolated record',dose:'sample',weight:null,nextDue:'2026-10-08',notes:'Edited after removal'},'PUT');assert.equal(r.code,200);
 r=await call('care','complete',{id:planId,date:'2026-10-20'});assert.equal(r.code,200);
 const [completed]=await db.query('SELECT p.status,r.care_type_id FROM planned_events p JOIN care_records r ON r.id=p.completed_record_id WHERE p.id=$1',[planId]);assert.deepEqual(completed,{status:'completed',care_type_id:id});
 const [base]=await db.query("SELECT id,is_active FROM care_types WHERE slug='weight'");r=await call('actions','',{id:base.id},'DELETE');assert.equal(r.code,base.is_active?200:404);
 assert.deepEqual((await db.query('SELECT is_active FROM care_types WHERE id=$1',[base.id]))[0],{is_active:false});
 console.log('PASS: actual API and isolated database preserve records and plans after removal, allow editing and completion, and support removing existing actions.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
