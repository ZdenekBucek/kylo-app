const{neon}=require('@neondatabase/serverless');const{createHash}=require('node:crypto');
module.exports=async(req,res)=>{try{
if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
const db=neon(process.env.DATABASE_URL),t=(req.headers.cookie||'').match(/(?:^|;\s*)kylo_session=([a-f0-9]{64})/)?.[1];
const users=t?await db.query('SELECT u.id,u.role FROM user_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active=true',[createHash('sha256').update(t).digest('hex')]):[];
if(!users.length)return res.status(401).json({error:'Přihlas se'});
if(users[0].role!=='admin')return res.status(403).json({error:'Pouze administrátor'});
const [types,records,plans,prefs]=await Promise.all([
db.query('SELECT slug,name,icon,default_interval_days,reminder_offsets FROM care_types ORDER BY sort_order'),
db.query('SELECT t.slug,r.event_date::text,r.product,r.dose,r.weight_kg,r.batch_expiry,r.notes,r.next_due_on::text FROM care_records r JOIN care_types t ON t.id=r.care_type_id ORDER BY r.event_date,r.created_at'),
db.query('SELECT t.slug,p.title,p.due_on::text,p.status,p.notes FROM planned_events p LEFT JOIN care_types t ON t.id=p.care_type_id ORDER BY p.due_on'),
db.query('SELECT enabled,preferred_time,repeat_overdue,reminders FROM user_notification_settings WHERE user_id=$1',[users[0].id])]);
res.setHeader('Cache-Control','no-store');res.setHeader('Content-Disposition','attachment; filename="kylo-backup-'+new Date().toISOString().slice(0,10)+'.json"');
return res.status(200).json({format:'kylo-care-backup',version:1,exported_at:new Date().toISOString(),types,records,plans,notification_settings:prefs[0]||null});
}catch(e){console.error('Backup',e.message);return res.status(500).json({error:'Zálohu se nepodařilo vytvořit'})}};