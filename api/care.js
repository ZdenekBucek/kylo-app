const {date:strictDate,settings,uuid}=require('../lib/planning');
const{neon}=require('@neondatabase/serverless');const{createHash}=require('node:crypto');
const send=(r,s,x)=>r.status(s).setHeader('Cache-Control','no-store').json(x),validDate=strictDate;
module.exports=async(q,r)=>{try{
if(!['GET','POST','PUT','DELETE'].includes(q.method))return send(r,405,{error:'Nepodporovaná metoda'});
if(q.method!=='GET'&&(q.headers['sec-fetch-site']==='cross-site'||q.headers.origin&&new URL(q.headers.origin).host!==q.headers.host))return send(r,403,{error:'Nepovolený požadavek'});
if(q.method!=='GET'&&!String(q.headers['content-type']||'').startsWith('application/json'))return send(r,415,{error:'Požadován JSON'});
const db=neon(process.env.DATABASE_URL),t=(q.headers.cookie||'').match(/(?:^|;\s*)kylo_session=([a-f0-9]{64})/)?.[1];
const users=t?await db.query('SELECT u.id,u.role FROM user_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active=true',[createHash('sha256').update(t).digest('hex')]):[];
if(!users.length)return send(r,401,{error:'Přihlas se'});
const user=users[0],a=q.query.action,b=q.body||{};
if(Buffer.byteLength(JSON.stringify(b))>32768)return send(r,413,{error:'Příliš velký požadavek'});
if(a==='plan'&&q.method==='POST'){
if(!validDate(b.date)||!uuid(b.careTypeId))return send(r,400,{error:'Neplatné datum nebo akce'});
let value;try{value=settings(b)}catch(e){return send(r,400,{error:e.message})}
const type=await db.query('SELECT id,slug FROM care_types WHERE id=$1 AND is_active=true',[b.careTypeId]);
if(!type.length)return send(r,400,{error:'Akce již není dostupná'});
const rows=await db.query('INSERT INTO planned_events(care_type_id,title,due_on,dose,interval_days,reminder_offsets,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[type[0].id,value.name,b.date,value.dose,value.interval,value.reminders,String(b.notes||'').slice(0,2000),user.id]);
return send(r,201,{id:rows[0].id});
}
if(a==='cancel'&&q.method==='POST'){
if(!uuid(b.id))return send(r,400,{error:'Neplatné ID'});
const rows=await db.query("UPDATE planned_events SET status='cancelled' WHERE id=$1 AND status='planned' RETURNING id",[b.id]);
return send(r,rows.length?200:409,rows.length?{ok:true}:{error:'Termín již není aktivní'});
}
if(a==='record'&&q.method==='PUT'){
if(!uuid(b.id)||!validDate(b.date)||(b.nextDue&&!validDate(b.nextDue)))return send(r,400,{error:'Neplatné datum'});
const w=b.weight===''||b.weight==null?null:Number(b.weight);if(w!==null&&(!Number.isFinite(w)||w<=0||w>100))return send(r,400,{error:'Neplatná hmotnost'});
const t=await db.query('SELECT id,slug FROM care_types WHERE slug=$1',[b.type]);if(!t.length||t[0].slug==='weight'&&w===null)return send(r,400,{error:'Neplatný typ nebo váha'});
const rows=await db.query('UPDATE care_records SET care_type_id=$1,event_date=$2,product=$3,dose=$4,weight_kg=$5,notes=$6,next_due_on=$7,updated_at=now() WHERE id=$8 RETURNING id',[t[0].id,b.date,String(b.product||'').slice(0,200),String(b.dose||'').slice(0,200),w,String(b.notes||'').slice(0,2000),b.nextDue||null,b.id]);
return send(r,rows.length?200:404,rows.length?{ok:true}:{error:'Záznam nenalezen'});
}
if(a==='record'&&q.method==='DELETE'){
if(!uuid(b.id))return send(r,400,{error:'Neplatné ID'});const x=await db.query('DELETE FROM care_records WHERE id=$1 RETURNING id',[b.id]);return send(r,x.length?200:404,x.length?{ok:true}:{error:'Záznam nenalezen'});
}
if(a==='complete'&&q.method==='POST'){
const recurring=b.sourceRecordId!=null;
if(!validDate(b.date)||(recurring?(!uuid(b.sourceRecordId)||b.id!=null):!uuid(b.id)))return send(r,400,{error:'Neplatný termín'});
const weight=b.weight==null||b.weight===''?null:Number(b.weight);
if(weight!==null&&(!Number.isFinite(weight)||weight<=0||weight>100))return send(r,400,{error:'Neplatná hmotnost'});
if(recurring){
const source=await db.query('SELECT t.slug,r.event_date::text FROM care_records r JOIN care_types t ON t.id=r.care_type_id WHERE r.id=$1',[b.sourceRecordId]);
if(source[0]?.slug==='weight'&&weight===null)return send(r,400,{error:'Vyplň hmotnost'});
if(source[0]&&b.date<source[0].event_date)return send(r,400,{error:'Datum provedení nesmí být před předchozí péčí'});
const rows=await db.query(`INSERT INTO care_records(care_type_id,event_date,product,notes,next_due_on,created_by,dose,weight_kg,reminder_offsets,source_record_id)
 SELECT s.care_type_id,$2::date,COALESCE(NULLIF($3,''),s.product),$4,
 CASE WHEN s.next_due_on>s.event_date THEN $2::date+(s.next_due_on-s.event_date) ELSE NULL END,
 $5,COALESCE($6,s.dose),$7,s.reminder_offsets,s.id
 FROM care_records s WHERE s.id=$1 AND s.next_due_on IS NOT NULL AND $2::date>=s.event_date
 AND s.id=(SELECT latest.id FROM care_records latest WHERE latest.care_type_id=s.care_type_id ORDER BY latest.event_date DESC,latest.created_at DESC LIMIT 1)
 ON CONFLICT(source_record_id) DO NOTHING RETURNING id,next_due_on::text`,[b.sourceRecordId,b.date,String(b.product||'').slice(0,200),String(b.notes||'').slice(0,2000),user.id,b.dose==null?null:String(b.dose).slice(0,200),weight]);
return send(r,rows.length?200:409,rows.length?{ok:true,nextDue:rows[0].next_due_on}:{error:'Termín již není aktivní. Obnov přehled péče.'});
}
const plannedType=await db.query("SELECT t.slug FROM planned_events p JOIN care_types t ON t.id=p.care_type_id WHERE p.id=$1 AND p.status='planned'",[b.id]);
if(plannedType[0]?.slug==='weight'&&weight===null)return send(r,400,{error:'Vyplň hmotnost'});
const x=await db.query("WITH source AS (SELECT p.id,p.title,p.care_type_id,p.dose,p.reminder_offsets,COALESCE(p.interval_days,t.default_interval_days) AS default_interval_days FROM planned_events p LEFT JOIN care_types t ON t.id=p.care_type_id WHERE p.id=$1 AND p.status='planned' FOR UPDATE OF p), record AS (INSERT INTO care_records(care_type_id,event_date,product,notes,next_due_on,created_by,dose,weight_kg,reminder_offsets) SELECT COALESCE(s.care_type_id,(SELECT id FROM care_types WHERE slug='other')),$2::date,COALESCE(NULLIF($3,''),s.title),$4,CASE WHEN COALESCE(s.default_interval_days,0)=0 THEN NULL ELSE $2::date+s.default_interval_days END,$5,COALESCE($6,s.dose),$7,s.reminder_offsets FROM source s RETURNING id), updated AS (UPDATE planned_events p SET status='completed',completed_record_id=r.id FROM source s CROSS JOIN record r WHERE p.id=s.id RETURNING p.id) SELECT (SELECT id FROM updated) AS done",[b.id,b.date,String(b.product||'').slice(0,200),String(b.notes||'').slice(0,2000),user.id,b.dose==null?null:String(b.dose).slice(0,200),weight]);
return send(r,x[0]?.done?200:409,x[0]?.done?{ok:true}:{error:'Termín již není aktivní'});
}
return send(r,404,{error:'Nenalezeno'});
}catch(e){console.error('Care',e.message);return send(r,500,{error:'Chyba při ukládání'})}};
