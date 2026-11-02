// Full browser → actual API handlers → isolated Neon database verification.
'use strict';
const assert=require('node:assert/strict'),{neon}=require('@neondatabase/serverless'),{randomBytes,randomUUID,createHash}=require('node:crypto'),{webkit}=require('@playwright/test');
if(!process.env.KYLO_TEST_BRANCH_ID||process.env.KYLO_TEST_BRANCH_ID==='br-frosty-cloud-b24au899')throw Error('An isolated test branch is required');
const handlers={'/api':require('../api/index'),'/api/care':require('../api/care'),'/api/actions':require('../api/actions'),'/api/settings':require('../api/settings')};
(async()=>{
 const db=neon(process.env.DATABASE_URL),name='Browser '+randomUUID().slice(0,8),token=randomBytes(32).toString('hex');
 const [user]=await db.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,'unused-test-hash','Browser verification','admin') RETURNING id",['browser-'+randomUUID().slice(0,8)]);
 await db.query("INSERT INTO user_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[user.id,createHash('sha256').update(token).digest('hex')]);
 const browser=await webkit.launch();try{
  const context=await browser.newContext({viewport:{width:402,height:874},isMobile:true,hasTouch:true,locale:'cs-CZ',timezoneId:'Europe/Prague'});
  await context.addCookies([{name:'kylo_session',value:token,url:'http://127.0.0.1:4173',httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-09T12:00:00+02:00')});
  await page.route('**/api**',async route=>{
   const request=route.request(),url=new URL(request.url()),handler=handlers[url.pathname];if(!handler)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:'branch-verification'})});
   // The adapter supplies this isolated test user session to actual auth checks.
   const req={method:request.method(),headers:{...await request.allHeaders(),host:url.host,cookie:'kylo_session='+token},query:Object.fromEntries(url.searchParams),body:request.method()==='GET'?{}:request.postDataJSON()};
   const res={code:200,headers:{},status(n){this.code=n;return this},setHeader(k,v){this.headers[k]=v;return this},json(value){this.body=value;return this}};await handler(req,res);if(res.code>=400)console.log(url.pathname,url.search,res.code,res.body.error,Boolean(req.headers.cookie));await route.fulfill({status:res.code,headers:{...res.headers,'Content-Type':'application/json'},body:JSON.stringify(res.body)});
  });
  await page.goto('http://127.0.0.1:4173');await page.locator('#inside').waitFor({state:'visible',timeout:10000}).catch(async e=>{console.log('Browser login feedback:',await page.locator('#loginError').textContent());throw e});
  await page.locator('nav button').filter({hasText:'Profil'}).click();await page.locator('#actionSettings summary').click();await page.getByRole('button',{name:'Přidat vlastní akci'}).click();await page.locator('#actionName').fill(name);await page.locator('#actionDose').fill('2 kapky');await page.locator('#actionInterval').fill('21');await page.locator('#actionReminders').fill('5, 0');await page.locator('#actionSave').click();await page.locator('#actionEditor').waitFor({state:'hidden'});
  await page.locator('nav button').filter({hasText:'Kalendář'}).click();await page.locator('[data-date="2026-10-20"]').click();await page.locator('nav.nav .plus').click();await page.locator('#typeOptions button').filter({hasText:name}).click();assert.equal(await page.locator('#dose').inputValue(),'2 kapky');await page.locator('#recordForm button[type="submit"]').click();await page.locator('#sheet').waitFor({state:'hidden'});await page.locator('#monthRows .highlighted').filter({hasText:name}).waitFor();
  await page.reload();await page.locator('#inside').waitFor({state:'visible'});await page.locator('nav button').filter({hasText:'Kalendář'}).click();await page.locator('[data-date="2026-10-20"]').click();await page.locator('#monthRows .highlighted').filter({hasText:name}).click();await page.locator('#startCompletion').click();await page.locator('#doneDate').fill('2026-10-20');await page.locator('#doneForm .primary').click();await page.locator('#doneForm').waitFor({state:'hidden'});
  const [record]=await db.query('SELECT dose,next_due_on::text,reminder_offsets FROM care_records WHERE product=$1',[name]);assert.deepEqual(record,{dose:'2 kapky',next_due_on:'2026-11-10',reminder_offsets:[5,0]});assert.deepEqual(errors,[]);
  console.log('PASS: mobile browser → actual API → isolated database → reload persistence → completed record and next due date; no browser errors.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
