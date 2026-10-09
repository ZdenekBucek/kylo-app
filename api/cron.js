const {neon}=require('@neondatabase/serverless');const webpush=require('web-push');
const send=(r,s,x)=>r.status(s).setHeader('Cache-Control','no-store').json(x);
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const days=(a,b)=>Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
const defaults={'fleas-ticks':[3,1,0],'deworming':[7,1,0],'vaccination':[30,7,0],'vet-check':[7,1,0],'weight':[1,0],'other':[7,1,0]};
module.exports=async(req,res)=>{try{
if(req.method!=='GET')return send(res,405,{error:'Metoda'});
if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return send(res,401,{error:'Unauthorized'});
webpush.setVapidDetails('https://kylo-app-zdenek-bucek.vercel.app',process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
const sql=neon(process.env.DATABASE_URL),date=today();
const latest=await sql.query("SELECT r.id,r.product,r.next_due_on::text AS due,t.slug,t.name FROM (SELECT DISTINCT ON (care_type_id) * FROM care_records ORDER BY care_type_id,event_date DESC,created_at DESC) r JOIN care_types t ON t.id=r.care_type_id WHERE r.next_due_on IS NOT NULL");
const planned=await sql.query("SELECT p.id,p.title,p.due_on::text AS due,COALESCE(t.slug,'other') AS slug FROM planned_events p LEFT JOIN care_types t ON t.id=p.care_type_id WHERE p.status='planned'");
const events=[...latest.map(x=>({...x,key:'record:'+x.id,title:x.product||x.name})),...planned.map(x=>({...x,key:'planned:'+x.id,title:x.title}))];
const devices=await sql.query('SELECT p.user_id,p.endpoint,p.p256dh,p.auth_secret FROM push_subscriptions p JOIN app_users u ON u.id=p.user_id WHERE u.is_active=true');
const settings=await sql.query('SELECT user_id,enabled,repeat_overdue,reminders FROM user_notification_settings');
const settingsByUser=new Map(settings.map(x=>[x.user_id,x]));
const byUser=new Map();for(const d of devices){if(!byUser.has(d.user_id))byUser.set(d.user_id,[]);byUser.get(d.user_id).push(d)}
let sent=0,skipped=0,errors=0;
for(const [userId,subs] of byUser){const pref=settingsByUser.get(userId);if(pref?.enabled===false)continue;
for(const event of events){const delta=days(event.due,date),offsets=pref?.reminders?.[event.slug]||defaults[event.slug]||defaults.other;
if(!(delta>=0?offsets.includes(delta):(pref?.repeat_overdue??true)))continue;
const done=await sql.query('SELECT 1 FROM notification_deliveries WHERE user_id=$1 AND event_key=$2 AND notification_date=$3 LIMIT 1',[userId,event.key,date]);if(done.length){skipped++;continue}
const when=delta<0?'po termínu ('+Math.abs(delta)+' dní)':delta===0?'dnes':'za '+delta+' dní';
const msg={title:'🐾 Kylo – '+event.title,body:'Péče '+when+'.',url:'/'};
let delivered=false;for(const s of subs){try{await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth_secret}},JSON.stringify(msg),{TTL:86400});delivered=true;sent++}catch(e){errors++;if([404,410].includes(e.statusCode))await sql.query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2',[userId,s.endpoint]);else console.error('Push',e.statusCode||e.message)}}
if(delivered)await sql.query('INSERT INTO notification_deliveries(user_id,event_key,notification_date) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[userId,event.key,date])}}
return send(res,200,{ok:true,date,events:events.length,devices:devices.length,sent,skipped,errors});
}catch(e){console.error('Cron',e.message);return send(res,500,{error:'Chyba plánovače'})}};