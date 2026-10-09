'use strict';
const {randomUUID}=require('node:crypto');
function createState(){
const types=[['vaccination','Očkování','💉',365],['deworming','Odčervení','🪱',90],['fleas-ticks','Klíšťata / blechy','🕷️',35],['vet-check','Veterinární návštěva','🩺',365],['weight','Vážení','⚖️',30],['other','Jiné','📝',null]].map(([slug,name,icon,default_interval_days])=>({id:randomUUID(),slug,name,icon,default_interval_days,default_dose:'',reminder_offsets:[7,1,0]}));
const record=(id,slug,product,event_date,weight_kg,next_due_on)=>({id,slug,product,event_date,weight_kg,next_due_on,type_name:types.find(t=>t.slug===slug).name,icon:types.find(t=>t.slug===slug).icon,dose:'',notes:''});
const user={id:'11111111-1111-4111-8111-111111111111',username:'e2e-owner',display_name:'Test správce',role:'admin'};
return {signedIn:false,user,types,records:[record('22222222-2222-4222-8222-222222222222','weight','Domácí vážení','2026-10-08',7.7,'2026-11-07'),record('33333333-3333-4333-8333-333333333333','fleas-ticks','Frontline Spot On','2026-09-26',null,'2026-10-31')],plans:[{id:'44444444-4444-4444-8444-444444444444',title:'Preventivní veterinární prohlídka',due_on:'2026-11-15',status:'planned'}],users:[{...user,is_active:true}],prefs:{enabled:true,repeatOverdue:false,preferredTime:'09:00',reminders:{vaccination:[30,7,1],deworming:[7,1],'fleas-ticks':[3,1,0],'vet-check':[14,3,0],weight:[7,1],other:[1]}}};
}
async function mockApi(page){
const db=createState();
await page.route('**/api**',async route=>{
const q=route.request(),u=new URL(q.url()),a=u.searchParams.get('action')||'',method=q.method();
const b=method==='GET'?{}:(q.postDataJSON()||{});
const send=(status,data,headers={})=>route.fulfill({status,contentType:'application/json',headers:{'Cache-Control':'no-store',...headers},body:JSON.stringify(data)});
if(u.pathname==='/api/version')return send(200,{version:'1.4.8-e2e',automatic:false});
if(u.pathname==='/api'&&a==='status')return send(200,{setupRequired:false});
if(u.pathname==='/api'&&a==='login'){if(b.username!=='e2e-owner'||b.password!=='e2e-test-password')return send(401,{error:'Nesprávné přihlašovací údaje'});db.signedIn=true;return send(200,{user:db.user})}
if(!db.signedIn)return send(401,{error:'Nejdříve se přihlas'});
if(u.pathname==='/api'&&a==='state')return send(200,{user:db.user,types:db.types,records:db.records,plans:db.plans});
if(u.pathname==='/api'&&a==='logout'){db.signedIn=false;return send(200,{ok:true})}
if(u.pathname==='/api'&&a==='users')return send(200,{users:db.users});
if(u.pathname==='/api'&&a==='add-user'){const user={id:randomUUID(),username:b.username,display_name:b.username,role:'user',is_active:true};db.users.push(user);return send(201,{user})}
if(u.pathname==='/api'&&['disable-user','enable-user'].includes(a)){const user=db.users.find(x=>x.id===b.userId);if(user)user.is_active=a==='enable-user';return send(200,{ok:true})}
if(u.pathname==='/api'&&['change-password','logout-all'].includes(a)){db.signedIn=false;return send(200,{ok:true})}
if(u.pathname==='/api'&&a==='record'&&method==='POST'){const t=db.types.find(x=>x.slug===b.type);const item={id:randomUUID(),slug:b.type,type_name:t.name,icon:t.icon,product:b.product,event_date:b.date,dose:b.dose||'',weight_kg:b.weight==null?null:Number(b.weight),next_due_on:b.nextDue||null,notes:b.notes||''};db.records.unshift(item);return send(201,{id:item.id})}
if(u.pathname==='/api/care'&&a==='record'){const i=db.records.findIndex(x=>x.id===b.id);if(i<0)return send(404,{error:'Záznam nenalezen'});if(method==='DELETE'){db.records.splice(i,1);return send(200,{ok:true})}const t=db.types.find(x=>x.slug===b.type);Object.assign(db.records[i],{slug:b.type,type_name:t.name,icon:t.icon,product:b.product,event_date:b.date,dose:b.dose||'',weight_kg:b.weight==null?null:Number(b.weight),next_due_on:b.nextDue||null,notes:b.notes||''});return send(200,{ok:true})}
if(u.pathname==='/api/actions'){const t=method==='PUT'?db.types.find(t=>t.id===b.id):{id:randomUUID(),slug:'custom-'+randomUUID(),icon:'🐾'};Object.assign(t,{name:b.name,default_dose:b.dose,default_interval_days:b.intervalDays||null,reminder_offsets:b.reminderOffsets});if(method==='POST')db.types.push(t);return send(method==='POST'?201:200,{id:t.id})}
if(u.pathname==='/api/care'&&a==='plan'){const t=db.types.find(x=>x.id===b.careTypeId);const p={id:randomUUID(),care_type_id:t.id,slug:t.slug,icon:t.icon,title:b.name,due_on:b.date,dose:b.dose,interval_days:b.intervalDays,reminder_offsets:b.reminderOffsets,notes:b.notes,status:'planned'};db.plans.push(p);return send(201,{id:p.id})}
if(u.pathname==='/api/care'&&a==='cancel'){db.plans=db.plans.filter(p=>p.id!==b.id);return send(200,{ok:true})}
if(u.pathname==='/api/care'&&a==='complete'){const i=db.plans.findIndex(x=>x.id===b.id);if(i<0)return send(409,{error:'Termín neexistuje'});const [p]=db.plans.splice(i,1),t=db.types.find(x=>x.id===p.care_type_id)||db.types.find(x=>x.slug==='vet-check'),next=new Date(b.date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+(p.interval_days||0));db.records.unshift({id:randomUUID(),slug:t.slug,type_name:t.name,icon:t.icon,product:b.product||p.title,event_date:b.date,dose:b.dose??p.dose??'',weight_kg:b.weight||null,next_due_on:p.interval_days?next.toISOString().slice(0,10):null,notes:b.notes||'',reminder_offsets:p.reminder_offsets});return send(200,{ok:true})}
if(u.pathname==='/api/settings'){if(method==='POST'){db.prefs={...db.prefs,...b};return send(200,{ok:true})}return send(200,db.prefs)}
if(u.pathname==='/api/push')return send(200,{publicKey:'test-key',ok:true});
if(u.pathname==='/api/backup')return send(200,{format:'kylo-care-backup',version:1,records:db.records,plans:db.plans,types:db.types},{'Content-Disposition':'attachment; filename="kylo-backup-e2e.json"'});
return send(404,{error:'Unknown mock API: '+u.pathname+' '+a});
});
return db;
}
module.exports={mockApi};
