const test=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');
let mode='guest';const fakeDb={query:async(sql,args)=>{if(sql.includes('FROM user_sessions s JOIN app_users u'))return mode==='admin'?[{id:'11111111-1111-4111-8111-111111111111',username:'owner',display_name:'Owner',role:'admin'}]:mode==='user'?[{id:'22222222-2222-4222-8222-222222222222',username:'member',display_name:'Member',role:'user'}]:[];if(sql.includes('count(*) FILTER'))return [{user_fails:mode==='locked'?5:0,ip_fails:0}];if(sql.includes('SELECT id,username,display_name,password_hash,role'))return [];if(sql.includes('SELECT id,username,display_name,role,is_active'))return [{id:'11111111-1111-4111-8111-111111111111',username:'owner',role:'admin',is_active:true}];return []}};
const orig=Module._load;Module._load=function(name,...args){if(name==='@neondatabase/serverless')return {neon:()=>fakeDb};return orig.call(this,name,...args)};const handler=require('../api/index.js');Module._load=orig;
process.env.DATABASE_URL='postgres://test';process.env.CRON_SECRET='test-secret';
async function call(action,method='GET',body={}){const req={method,query:{action},body,headers:{host:'kylo.test','content-type':'application/json',cookie:mode==='guest'||mode==='locked'?'':'kylo_session='+'a'.repeat(64)}};const res={code:200,body:null,status(s){this.code=s;return this},setHeader(){return this},json(b){this.body=b;return this}};await handler(req,res);return res}
test('setup endpoint permanently disabled',async()=>{mode='guest';assert.equal((await call('setup')).code,410)});
test('status does not reopen setup',async()=>{mode='guest';assert.deepEqual((await call('status')).body,{setupRequired:false})});
test('unauthenticated state denied',async()=>{mode='guest';assert.equal((await call('state')).code,401)});
test('unauthenticated user list denied',async()=>{mode='guest';assert.equal((await call('users')).code,401)});
test('regular user cannot add account',async()=>{mode='user';assert.equal((await call('add-user','POST',{username:'hacker',password:'abcdefghijklmn'})).code,403)});
test('regular user cannot list accounts',async()=>{mode='user';assert.equal((await call('users')).code,403)});
test('regular user cannot deactivate account',async()=>{mode='user';assert.equal((await call('disable-user','POST',{userId:'11111111-1111-4111-8111-111111111111'})).code,403)});
test('admin can list accounts',async()=>{mode='admin';assert.equal((await call('users')).code,200)});
test('admin must use strong password',async()=>{mode='admin';assert.equal((await call('add-user','POST',{username:'another',password:'short'})).code,400)});
test('short new password rejected',async()=>{mode='user';assert.equal((await call('change-password','POST',{currentPassword:'anything',newPassword:'short'})).code,400)});
test('locked login rejected with 429',async()=>{mode='locked';assert.equal((await call('login','POST',{username:'owner',password:'wrongpassword'})).code,429)});
test('cross-site POST rejected',async()=>{mode='user';const req={method:'POST',query:{action:'logout'},body:{},headers:{host:'kylo.test',origin:'https://evil.example','content-type':'application/json'}};const res={code:200,status(s){this.code=s;return this},setHeader(){return this},json(){return this}};await handler(req,res);assert.equal(res.code,403)});
