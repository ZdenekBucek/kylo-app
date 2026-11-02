// Real API/database and optional browser verification on an isolated Neon branch.
'use strict';
const assert=require('node:assert/strict'),{neon}=require('@neondatabase/serverless'),{randomBytes,randomUUID,createHash}=require('node:crypto');
if(!process.env.KYLO_TEST_BRANCH_ID||process.env.KYLO_TEST_BRANCH_ID==='br-frosty-cloud-b24au899')throw Error('An isolated test branch is required');
const db=neon(process.env.DATABASE_URL),handlers={'/api':require('../api/index'),'/api/care':require('../api/care')},token=randomBytes(32).toString('hex');
async function invoke(path,action,body={},method='POST'){
 const req={method,query:{action},body,headers:{host:'kylo.test','content-type':'application/json',cookie:'kylo_session='+token}};
 const res={code:200,body:null,status(s){this.code=s;return this},setHeader(){return this},json(b){this.body=b;return this}};
 await handlers[path](req,res);return res;
}
(async()=>{
 const [user]=await db.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,'unused-test-hash','Completion verification','user') RETURNING id",['complete-'+randomUUID().slice(0,8)]);
 await db.query("INSERT INTO user_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[user.id,createHash('sha256').update(token).digest('hex')]);
 const [type]=await db.query("INSERT INTO care_types(slug,name,icon,default_interval_days) VALUES($1,'Completion test','🐾',90) RETURNING id,slug",['custom-'+randomUUID()]);
 const [source]=await db.query("INSERT INTO care_records(care_type_id,event_date,product,dose,next_due_on,reminder_offsets,created_by) VALUES($1,'2026-09-26','Completion test','1 pipeta','2026-10-31',ARRAY[5,0],$2) RETURNING id",[type.id,user.id]);
 const outcomes=await Promise.all([invoke('/api/care','complete',{sourceRecordId:source.id,date:'2026-10-30'}),invoke('/api/care','complete',{sourceRecordId:source.id,date:'2026-10-30'})]);assert.deepEqual(outcomes.map(r=>r.code).sort(),[200,409]);
 const [done]=await db.query('SELECT id,event_date::text,next_due_on::text,dose,reminder_offsets FROM care_records WHERE source_record_id=$1',[source.id]);assert.equal(done.event_date,'2026-10-30');assert.equal(done.next_due_on,'2026-12-04');assert.equal(done.dose,'1 pipeta');assert.deepEqual(done.reminder_offsets,[5,0]);
 const [old]=await db.query('SELECT event_date::text,next_due_on::text FROM care_records WHERE id=$1',[source.id]);assert.deepEqual(old,{event_date:'2026-09-26',next_due_on:'2026-10-31'});
 assert.equal((await invoke('/api/care','complete',{sourceRecordId:source.id,date:'2026-11-01'})).code,409);
 assert.equal((await invoke('/api/care','complete',{sourceRecordId:done.id,date:'2026-10-29'})).code,400);
 // Completing care still works after its action definition has been archived.
 await db.query('UPDATE care_types SET is_active=false WHERE id=$1',[type.id]);
 assert.equal((await invoke('/api/care','complete',{sourceRecordId:done.id,date:'2026-12-05'})).code,200);
 const [second]=await db.query('SELECT next_due_on::text FROM care_records WHERE source_record_id=$1',[done.id]);assert.equal(second.next_due_on,'2027-01-09');
 // Explicit plans also anchor their next term to actual date, and retain a zero interval.
 for(const interval of [21,0]){
  const [plan]=await db.query("INSERT INTO planned_events(care_type_id,title,due_on,interval_days,reminder_offsets,created_by) VALUES($1,'Explicit completion','2026-10-20',$2,ARRAY[]::integer[],$3) RETURNING id",[type.id,interval,user.id]);
  const r=await invoke('/api/care','complete',{id:plan.id,date:'2026-10-23'});assert.equal(r.code,200);
  const [record]=await db.query('SELECT r.event_date::text,r.next_due_on::text FROM planned_events p JOIN care_records r ON r.id=p.completed_record_id WHERE p.id=$1',[plan.id]);assert.deepEqual(record,{event_date:'2026-10-23',next_due_on:interval?'2026-11-13':null});
  assert.equal((await invoke('/api/care','complete',{id:plan.id,date:'2026-10-23'})).code,409);
 }
 console.log('PASS: real API/SQL actual dates, original intervals/reminders, preserved history, concurrent/repeated completion, archived actions, consecutive cycles and one-off plans.');
 if(process.env.KYLO_BROWSER_VERIFY==='1'){
  const {chromium}=require('@playwright/test');
  const browser=await chromium.launch();try{
   const page=await browser.newPage({viewport:{width:430,height:932},timezoneId:'Europe/Prague',locale:'cs-CZ'});
   await page.route('**/api**',async route=>{const q=route.request(),u=new URL(q.url());if(u.pathname==='/api/version')return route.fulfill({status:200,contentType:'application/json',body:'{"version":"test","automatic":false}'});if(!handlers[u.pathname])return route.fulfill({status:200,contentType:'application/json',body:'{}'});const r=await invoke(u.pathname,u.searchParams.get('action'),q.method()==='GET'?{}:q.postDataJSON(),q.method());await route.fulfill({status:r.code,contentType:'application/json',body:JSON.stringify(r.body)})});
   await page.goto('http://127.0.0.1:4173/');await page.locator('#inside').waitFor({state:'visible'});
   // Open the test occurrence directly, independent of other copied production records.
   await page.locator('nav button').filter({hasText:'Kalendář'}).click();
   await page.evaluate(()=>{view=new Date('2027-01-01T12:00:00');drawCalendar()});
   await page.locator('#monthRows .complete-care[data-event="'+type.slug+'"]').click();
   await page.locator('#doneDate').fill('2027-01-10');await page.screenshot({path:'/tmp/kylo-completion-preview.png'});assert.match(await page.locator('#doneNext').textContent(),/14. února 2027/);await page.locator('#doneForm .primary').click();await page.locator('#careDialog').waitFor({state:'hidden'});await page.reload();await page.locator('#inside').waitFor({state:'visible'});
   const [last]=await db.query('SELECT event_date::text,next_due_on::text FROM care_records WHERE care_type_id=$1 ORDER BY event_date DESC,created_at DESC LIMIT 1',[type.id]);assert.deepEqual(last,{event_date:'2027-01-10',next_due_on:'2027-02-14'});console.log('PASS: browser → actual care API → isolated PostgreSQL → reload.');
  }finally{await browser.close()}
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
