'use strict';
const {neon}=require('@neondatabase/serverless');
const {createHash,randomUUID}=require('node:crypto');
const {uuid,settings}=require('../lib/planning');
const send=(r,s,x)=>r.status(s).setHeader('Cache-Control','no-store').json(x);
module.exports=async(req,res)=>{
  try {
    if (!['POST','PUT','DELETE'].includes(req.method)) return send(res,405,{error:'Nepodporovaná metoda'});
    if (req.headers['sec-fetch-site']==='cross-site' || req.headers.origin && new URL(req.headers.origin).host!==req.headers.host) return send(res,403,{error:'Nepovolený požadavek'});
    if (!String(req.headers['content-type']||'').startsWith('application/json')) return send(res,415,{error:'Požadován JSON'});
    if (Buffer.byteLength(JSON.stringify(req.body||{}))>32768) return send(res,413,{error:'Příliš velký požadavek'});
    const db=neon(process.env.DATABASE_URL),token=(req.headers.cookie||'').match(/(?:^|;\s*)kylo_session=([a-f0-9]{64})/)?.[1];
    const users=token?await db.query('SELECT u.id,u.role FROM user_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active=true',[createHash('sha256').update(token).digest('hex')]):[];
    if (!users.length) return send(res,401,{error:'Přihlas se'});
    if (users[0].role!=='admin') return send(res,403,{error:'Nastavení akcí spravuje administrátor'});
    const b=req.body||{};
    if(req.method==='DELETE'){
      if(!uuid(b.id))return send(res,400,{error:'Neplatné ID akce'});
      const rows=await db.query("UPDATE care_types SET is_active=false WHERE id=$1 AND slug LIKE 'custom-%' AND is_active=true RETURNING id",[b.id]);
      return send(res,rows.length?200:404,rows.length?{ok:true}:{error:'Vlastní akce nebyla nalezena nebo už je odstraněná'});
    }
    let value;try {value=settings(b)} catch(e){return send(res,400,{error:e.message})}
    const {name,dose,interval,reminders}=value;
    if(req.method==='PUT'&&!uuid(b.id)) return send(res,400,{error:'Neplatné ID akce'});
    const rows=req.method==='POST'
      ?await db.query("INSERT INTO care_types(slug,name,icon,default_dose,default_interval_days,reminder_offsets,sort_order) VALUES($1,$2,'🐾',$3,$4,$5,(SELECT COALESCE(MAX(sort_order),0)+1 FROM care_types)) RETURNING id",['custom-'+randomUUID(),name,dose,interval||null,reminders])
      :await db.query('UPDATE care_types SET name=$1,default_dose=$2,default_interval_days=$3,reminder_offsets=$4 WHERE id=$5 AND is_active=true RETURNING id',[name,dose,interval||null,reminders,b.id]);
    return send(res,rows.length?(req.method==='POST'?201:200):404,rows.length?{id:rows[0].id}:{error:'Akce nenalezena'});
  } catch(e){console.error('Actions',e.message);return send(res,500,{error:'Akci se nepodařilo uložit'})}
};
