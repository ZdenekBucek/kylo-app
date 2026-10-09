const {neon}=require('@neondatabase/serverless');
const webpush=require('web-push');const {createHash}=require('node:crypto');
const sha=s=>createHash('sha256').update(s).digest('hex');
const respond=(r,status,data)=>r.status(status).setHeader('Cache-Control','no-store').json(data);
const cookie=req=>(req.headers.cookie||'').match(/(?:^|;\s*)kylo_session=([^;]+)/)?.[1];
async function user(req,sql){let t=cookie(req);if(!t)return null;let a=await sql.query('SELECT u.id FROM user_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active=true',[sha(t)]);return a[0]||null}
function vapid(){webpush.setVapidDetails('https://kylo-app-zdenek-bucek.vercel.app',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY)}
module.exports=async(req,res)=>{try{
if(req.method==='GET'&&req.query.action==='public-key')return respond(res,200,{publicKey:process.env.VAPID_PUBLIC_KEY});
if(req.method!=='POST')return respond(res,405,{error:'Nepodporovaná metoda'});
if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return respond(res,403,{error:'Nepovolený požadavek'});
const sql=neon(process.env.DATABASE_URL),u=await user(req,sql);if(!u)return respond(res,401,{error:'Přihlas se'});
const action=String(req.query.action||''),b=req.body||{};
if(action==='subscribe'){let s=b.subscription||{},k=s.keys||{};
if(typeof s.endpoint!=='string'||s.endpoint.length>2048||!s.endpoint.startsWith('https://')||typeof k.p256dh!=='string'||typeof k.auth!=='string'||k.p256dh.length>512||k.auth.length>512)return respond(res,400,{error:'Neplatné přihlášení k notifikacím'});
await sql.query('INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth_secret) VALUES($1,$2,$3,$4) ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth_secret=EXCLUDED.auth_secret',[u.id,s.endpoint,k.p256dh,k.auth]);return respond(res,200,{ok:true})}
if(action==='unsubscribe'){if(typeof b.endpoint!=='string')return respond(res,400,{error:'Neplatné zařízení'});await sql.query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2',[u.id,b.endpoint]);return respond(res,200,{ok:true})}
if(action==='test'){let recent=await sql.query("SELECT 1 FROM notification_deliveries WHERE user_id=$1 AND event_key='manual-test' AND sent_at>now()-interval '30 seconds' LIMIT 1",[u.id]);if(recent.length)return respond(res,429,{error:'Další test za 30 sekund'});
let subs=await sql.query('SELECT endpoint,p256dh,auth_secret FROM push_subscriptions WHERE user_id=$1',[u.id]);if(!subs.length)return respond(res,409,{error:'Nejdřív povol notifikace'});
vapid();let sent=0;for(let s of subs){try{await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth_secret}},JSON.stringify({title:'🐾 Kylo – test',body:'Push notifikace fungují i při zavřené aplikaci.',url:'/'}),{TTL:3600});sent++}catch(e){if([404,410].includes(e.statusCode))await sql.query('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2',[s.endpoint,u.id]);else console.error('Push test',e.statusCode||e.message)}}
if(sent)await sql.query("INSERT INTO notification_deliveries(user_id,event_key,notification_date) VALUES($1,'manual-test',(now() AT TIME ZONE 'Europe/Prague')::date) ON CONFLICT(user_id,event_key,notification_date) DO UPDATE SET sent_at=now()",[u.id]);
return respond(res,sent?200:502,{sent,error:sent?undefined:'Nepodařilo se odeslat upozornění'})}
return respond(res,404,{error:'Nenalezeno'});
}catch(e){console.error('Push',e.message);return respond(res,500,{error:'Chyba notifikační služby'})}};