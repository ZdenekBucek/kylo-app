const $=id=>document.getElementById(id);let state={types:[],records:[],plans:[]},kind=null,setup=false,view=new Date();view.setDate(1);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const day=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const fmt=s=>new Date(s+'T12:00:00').toLocaleDateString('cs-CZ',{day:'numeric',month:'long',year:'numeric'});
const plus=(s,n)=>{let d=new Date(s+'T12:00:00');d.setDate(d.getDate()+Number(n));return day(d)};
async function api(action,method='GET',body){let r=await fetch('/api?action='+action,{method,headers:{'Content-Type':'application/json'},credentials:'same-origin',body:body?JSON.stringify(body):undefined});let x=await r.json().catch(()=>({error:'Chyba komunikace'}));if(!r.ok)throw Object.assign(new Error(x.error||'Chyba serveru'),{status:r.status});return x}
async function init(){
 $('startup').hidden=false;$('startupRetry').hidden=true;$('startupMessage').textContent='Načítám přehled péče…';$('startupMessage').setAttribute('role','status');
 try{await refresh();show()}
 catch(e){
  if(e.status===401){
   try{setup=(await api('status')).setupRequired;$('setupWrap').hidden=!setup;$('loginActionLabel').textContent=setup?'Vytvořit první účet':'Přihlásit se'}catch{setup=false}
   $('startup').hidden=true;$('login').classList.remove('hidden');
  }else{$('startupMessage').textContent='Přehled se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.';$('startupMessage').setAttribute('role','alert');$('startupRetry').hidden=false}
 }
}
async function enter(event){
 event?.preventDefault();const button=$('loginAction');if(button.disabled)return;
 button.disabled=true;button.setAttribute('aria-busy','true');$('loginActionLabel').textContent='Přihlašuji…';$('loginError').textContent='';
 try{
  await api(setup?'setup':'login','POST',{username:$('loginUsername').value,password:$('loginPassword').value,code:$('setupCode').value});
  await refresh();show();
 }catch(e){$('loginError').textContent=e.message}
 finally{button.disabled=false;button.setAttribute('aria-busy','false');$('loginActionLabel').textContent=setup?'Vytvořit první účet':'Přihlásit se'}
}
function toggleLoginPassword(){
 const input=$('loginPassword'),button=$('loginPasswordToggle'),visible=input.type==='password';
 input.type=visible?'text':'password';button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-label',visible?'Skrýt heslo':'Zobrazit heslo');input.focus({preventScroll:true});
}
function show(){$('startup').hidden=true;$('login').classList.add('hidden');$('appShell').classList.remove('login-shell');$('inside').classList.remove('hidden');render();loadVersion()}
async function refresh(){state=await api('state');render()}
function go(id,button){document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.nav button:not(.plus)').forEach(x=>x.classList.remove('active'));button.classList.add('active');render();if(id==='profile'){refreshPushStatus();loadPrefs();if(state.user?.role==='admin')loadAdminUsers()}}
function row(x,d){return '<div class="care"><div class="ico">'+esc(x.icon||'🐾')+'</div><div class="grow"><div class="name">'+esc(x.product||x.title||x.type_name)+'</div><div class="sub">'+esc(d)+'</div></div></div>'}
function events(){
 const latest=new Map();for(const r of state.records)if(!latest.has(r.slug))latest.set(r.slug,r.next_due_on?{...r,due:r.next_due_on}:null);
 const plans=state.plans.map(p=>({...p,due:p.due_on,planId:p.id,icon:p.icon||state.types.find(t=>t.id===p.care_type_id)?.icon||'🐾'}));
 return [...latest.values()].filter(Boolean).filter(r=>!plans.some(p=>p.care_type_id===state.types.find(t=>t.slug===r.slug)?.id&&p.due===r.due)).concat(plans).sort((a,b)=>a.due.localeCompare(b.due));
}
let weightRange='all',weightPoints=[],selectedWeightKey=null;
function setWeightRange(r){weightRange=r;selectedWeightKey=null;drawWeight()}
function weightSelection(){
 const selected=weightPoints.find(p=>p.key===selectedWeightKey),details=$('weightPointDetails');
 details.hidden=!weightPoints.length;
 details.textContent=selected?fmt(selected.date)+' · '+selected.kg.toLocaleString('cs-CZ',{maximumFractionDigits:2})+' kg':'Klepni na bod pro datum a hmotnost.';
 document.querySelectorAll('#weightGraph [data-weight-index]').forEach((node,i)=>{const active=weightPoints[i]?.key===selectedWeightKey;node.setAttribute('aria-pressed',String(active));node.classList.toggle('selected',active)});
}
function selectWeightPoint(index,event){
 if(event?.detail>0){
  const svg=event.currentTarget.ownerSVGElement,matrix=svg?.getScreenCTM();
  if(matrix){const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const local=point.matrixTransform(matrix.inverse());let distance=Infinity;weightPoints.forEach((p,i)=>{const d=(p.x-local.x)**2+(p.y-local.y)**2;if(d<distance){distance=d;index=i}})}
 }
 if(!weightPoints[index])return;selectedWeightKey=weightPoints[index].key;weightSelection();
}
function weightPointKey(event,index){
 let next=index;
 if(event.key==='ArrowRight')next=Math.min(weightPoints.length-1,index+1);
 else if(event.key==='ArrowLeft')next=Math.max(0,index-1);
 else if(event.key==='Home')next=0;
 else if(event.key==='End')next=weightPoints.length-1;
 else if(!['Enter',' '].includes(event.key))return;
 event.preventDefault();selectWeightPoint(next);document.querySelector('#weightGraph [data-weight-index="'+next+'"]')?.focus();
}
function drawWeight(){
 const w=state.records.map((r,i)=>({...r,key:r.id||r.event_date+':'+i})).filter(r=>r.weight_kg!=null&&Number(r.weight_kg)>0).map(r=>({key:r.key,date:r.event_date,kg:Number(r.weight_kg)})).sort((a,b)=>a.date.localeCompare(b.date)),last=w.at(-1);
 $('weightCard').querySelector('.metric').textContent=last?last.kg.toLocaleString('cs-CZ')+' kg':'Bez měření';
 $('weightCard').querySelector('.sub').textContent=last?'Poslední vážení · '+fmt(last.date):'Zatím bez vážení';
 const diff=w.length>1?last.kg-w.at(-2).kg:null;
 $('weightTrend').textContent=diff===null?(w.length?'Po dalším vážení se zobrazí trend.':'Přidej první vážení přes +.'):(diff>0?'+':'')+diff.toLocaleString('cs-CZ',{maximumFractionDigits:2})+' kg oproti předchozímu měření';
 document.querySelectorAll('[data-weight-range]').forEach(b=>b.classList.toggle('selected',b.dataset.weightRange===weightRange));
 let cut=null;if(weightRange!=='all'){let d=new Date();d.setMonth(d.getMonth()-(weightRange==='6m'?6:12));cut=day(d)}
 const p=cut?w.filter(x=>x.date>=cut):w,box=$('weightGraph');weightPoints=p;
 if(!p.some(x=>x.key===selectedWeightKey))selectedWeightKey=null;
 if(!p.length){box.innerHTML='<div class="weight-empty">V tomto období nejsou žádná měření.</div>';weightSelection();return}
 const W=340,H=190,L=40,R=22,T=22,B=37,values=p.map(x=>x.kg),mn=Math.min(...values),mx=Math.max(...values),pad=Math.max(.2,(mx-mn)*.25),lo=Math.max(0,mn-pad),hi=mx+pad,ts=p.map(x=>Date.parse(x.date+'T12:00:00Z')),t0=Math.min(...ts),t1=Math.max(...ts),x=t=>t0===t1?L+(W-L-R)/2:L+(t-t0)/(t1-t0)*(W-L-R),y=v=>T+(hi-v)/(hi-lo)*(H-T-B),pts=p.map((q,i)=>({...q,x:x(ts[i]),y:y(q.kg)}));
 const grid=[0,.5,1].map(f=>{const val=lo+(hi-lo)*f,py=y(val);return '<line x1="'+L+'" x2="'+(W-R)+'" y1="'+py+'" y2="'+py+'" stroke="#e2eae2" stroke-dasharray="3 4"/><text x="'+(L-5)+'" y="'+(py+4)+'" text-anchor="end" font-size="10" fill="#7b847f">'+val.toFixed(1)+'</text>'}).join('');
 const path=pts.map((q,i)=>(i?'L':'M')+q.x.toFixed(1)+' '+q.y.toFixed(1)).join(' ');
 const dots=pts.map((q,i)=>'<g class="weight-point" role="button" tabindex="0" aria-pressed="false" aria-label="'+esc(fmt(q.date)+': '+q.kg.toLocaleString('cs-CZ')+' kg')+'" data-weight-index="'+i+'" onclick="selectWeightPoint('+i+',event)" onkeydown="weightPointKey(event,'+i+')"><circle class="weight-point-hit" cx="'+q.x+'" cy="'+q.y+'" r="22" fill="transparent"/><circle class="weight-point-halo" cx="'+q.x+'" cy="'+q.y+'" r="10"/><circle cx="'+q.x+'" cy="'+q.y+'" r="5" fill="#315d42" stroke="#fff" stroke-width="2"/></g>').join('');
 const ix=t0===t1?[0]:[0,Math.floor((p.length-1)/2),p.length-1].filter((v,i,a)=>a.indexOf(v)===i).filter(i=>i===0||i===p.length-1||pts[i].x>=pts[0].x+80&&pts[i].x<=pts.at(-1).x-80),labels=ix.map((i,j)=>'<text x="'+pts[i].x+'" y="'+(H-8)+'" text-anchor="'+(ix.length===1?'middle':j===0?'start':j===ix.length-1?'end':'middle')+'" font-size="10" fill="#7b847f">'+new Date(p[i].date+'T12:00:00').toLocaleDateString('cs-CZ')+'</text>').join('');
 weightPoints=pts;box.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="group" aria-label="Vývoj hmotnosti Kyla">'+grid+(pts.length>1?'<path d="'+path+'" stroke="#315d42" stroke-width="2.5" fill="none"/>':'')+labels+dots+'</svg>';weightSelection();
}

function renderHomeOverview(){
 const now=new Date(),today=day(now),ev=events(),next=ev[0],late=ev.filter(e=>e.due<today),soon=ev.filter(e=>e.due>=today&&e.due<=plus(today,30));
 const capitalize=s=>s.charAt(0).toUpperCase()+s.slice(1);
 $('homeDate').textContent=capitalize(now.toLocaleDateString('cs-CZ',{weekday:'long'}))+', '+now.toLocaleDateString('cs-CZ',{day:'numeric',month:'long',year:'numeric'});
 $('homeStats').innerHTML=[['Po termínu',late.length],['Do 30 dní',soon.length],['Záznamů',state.records.length]].map(([label,count])=>'<div><b>'+count+'</b><small>'+label+'</small></div>').join('');
 $('homeCareCard').classList.toggle('empty',!next);
 $('homeCareCard').classList.toggle('overdue',Boolean(next&&next.due<today));
 $('homeCareButton').disabled=!next;$('homeComplete').hidden=!next;if(next){$('homeComplete').dataset.complete=next.planId||next.slug;$('homeComplete').dataset.plan=next.planId?'1':'0'}$('homeCareDetails').hidden=!next;$('homeCareCountdown').hidden=!next;
 if(!next){$('homeCareHeading').textContent='Přehled péče';$('careStatus').textContent='Žádné termíny';$('homeCareWeekday').textContent='Novou péči přidáš tlačítkem +.';$('homeCareButton').setAttribute('aria-label','Žádné naplánované termíny');return}
 const date=new Date(next.due+'T12:00:00'),delta=Math.round((Date.parse(next.due+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000),n=Math.abs(delta),days=n===1?'den':n>=2&&n<=4?'dny':'dní';
 $('homeCareHeading').textContent=delta<0?'Péče po termínu':'Další péče';
 $('homeCareCountdown').textContent=delta<0?n+' '+days+' po termínu':delta===0?'Dnes':delta===1?'Zítra':'Za '+n+' '+days;
 $('careStatus').textContent=date.toLocaleDateString('cs-CZ',{day:'numeric',month:'long'});
 $('homeCareWeekday').textContent=capitalize(date.toLocaleDateString('cs-CZ',{weekday:'long'}))+' · '+date.getFullYear();
 const title=next.product||next.title||next.type_name||'Plánovaná péče';
 const type=next.type_name||state.types.find(t=>t.id===next.care_type_id||t.slug===next.slug)?.name||'Plánovaná akce';
 $('homeCareProduct').textContent=title;$('homeCareType').textContent=type+(next.dose?' · '+next.dose:'');
 $('homeCareButton').setAttribute('aria-label','Zobrazit v kalendáři: '+title+', '+fmt(next.due));
}
function render(){if(!state.records)return;renderHomeOverview();$('historyRows').innerHTML=state.records.map(x=>row(x,fmt(x.event_date)+(x.weight_kg?' · '+x.weight_kg+' kg':''))).join('');drawWeight();drawCalendar();renderProfile()}
function renderProfile(){const adminBox=$('adminUserAccordion');if(adminBox)adminBox.hidden=state.user?.role!=='admin';const u=$('profileUsername');if(u)u.textContent=state.user?.display_name||state.user?.username||'Nepřihlášen';const w=$('profileWeight');if(w){const last=state.records.filter(x=>x.weight_kg!=null&&Number(x.weight_kg)>0).sort((a,b)=>b.event_date.localeCompare(a.event_date))[0];w.textContent=last?Number(last.weight_kg).toLocaleString('cs-CZ',{maximumFractionDigits:2})+' kg':'Bez měření';const caption=$('profileWeightCaption');if(caption)caption.textContent=last?'Poslední vážení':'Zatím bez vážení'}}
function moveMonth(n){view.setMonth(view.getMonth()+n);drawCalendar()}
function drawCalendar(){let y=view.getFullYear(),m=view.getMonth(),count=new Date(y,m+1,0).getDate(),pad=(new Date(y,m,1).getDay()+6)%7,e=events();$('monthTitle').textContent=view.toLocaleDateString('cs-CZ',{month:'long',year:'numeric'});$('calendarDays').innerHTML=['Po','Út','St','Čt','Pá','So','Ne'].map(x=>'<div class="sub">'+x+'</div>').join('')+Array(pad).fill('<span></span>').join('')+Array.from({length:count},(_,i)=>{let d=y+'-'+String(m+1).padStart(2,'0')+'-'+String(i+1).padStart(2,'0');return '<button class="day '+(e.some(x=>x.due===d)?'dot':'')+'" onclick="showDay(\''+d+'\')">'+(i+1)+'</button>'}).join('');$('monthRows').innerHTML=e.filter(x=>x.due.startsWith(y+'-'+String(m+1).padStart(2,'0'))).map(x=>row(x,fmt(x.due))).join('')||'<p class="sub">Žádné termíny</p>'}
function showDay(d){$('calendarSelection').textContent=fmt(d)}
function openSheet(){$('sheet').classList.add('show');$('typeOptions').hidden=false;$('recordFields').hidden=true;$('sheetTitle').textContent='Nový záznam'}
function closeSheet(e){if(e.target.id==='sheet')$('sheet').classList.remove('show')}
function pick(name){kind=state.types.find(x=>name.includes(x.icon))||state.types.find(x=>x.slug==='other');$('sheetTitle').textContent=kind.name;$('typeOptions').hidden=true;$('recordFields').hidden=false;let simple=kind.slug==='weight'||kind.slug==='vet-check';$('recordFields').innerHTML='<form id="recordForm"><label>Datum<input id="eventDate" type="date" class="input" required value="'+day(new Date())+'"></label><label>'+(simple?'Úkon':'Přípravek / úkon')+'<input id="product" class="input" value="'+esc(state.records.find(r=>r.slug===kind.slug)?.product||kind.name)+'"></label>'+(simple?'':'<label>Dávka<input id="dose" class="input"></label>')+(kind.slug==='weight'?'<label>Hmotnost (kg)<input id="kg" type="number" min="0.1" step="0.01" class="input" required></label>':'')+'<label>Další termín<input id="nextDue" type="date" class="input"></label><label>Poznámka<input id="notes" class="input"></label><button type="submit" class="primary">Uložit záznam</button><p id="saveError" class="sub" style="color:#b22"></p></form>';if(kind.default_interval_days)$('nextDue').value=plus(day(new Date()),kind.default_interval_days);$('recordForm').onsubmit=save}
async function save(e){e.preventDefault();try{await api('record','POST',{type:kind.slug,date:$('eventDate').value,product:$('product').value,dose:$('dose')?.value||'',weight:$('kg')?.value||null,nextDue:$('nextDue').value||null,notes:$('notes').value});$('sheet').classList.remove('show');await refresh();go('history',document.querySelectorAll('.nav button:not(.plus)')[1])}catch(e){$('saveError').textContent=e.message}}
async function addUser(){try{await api('add-user','POST',{username:$('newUsername').value,password:$('newPassword').value});$('newUserStatus').textContent='Účet vytvořen';$('newPassword').value='';await loadAdminUsers()}catch(e){$('newUserStatus').textContent=e.message}}
async function changeAccountPassword(){const status=$('securityFeedback');try{const currentPassword=$('currentPassword').value,newPassword=$('accountNewPassword').value;if(newPassword.length<12)throw Error('Nové heslo musí mít alespoň 12 znaků');await api('change-password','POST',{currentPassword,newPassword});status.textContent='Heslo změněno. Přihlas se znovu.';setTimeout(()=>location.reload(),1000)}catch(e){status.textContent=e.message}}
async function logoutEverywhere(opener){if(!await askConfirmation({title:'Odhlásit všechna zařízení?',message:'Odhlásí se všechna zařízení včetně tohoto. Pro další použití se přihlásíš znovu.',accept:'Odhlásit zařízení',cancel:'Zpět',opener}))return;try{await api('logout-all','POST');location.reload()}catch(e){$('securityFeedback').textContent=e.message}}
async function loadAdminUsers(){const target=$('adminUserList');if(!target||state.user?.role!=='admin')return;try{const result=await api('users');target.innerHTML='<h4>Existující účty</h4>'+result.users.map(u=>'<div class="user-row"><div><b>'+esc(u.username)+'</b><span class="sub">'+(u.role==='admin'?'Administrátor':'Uživatel')+' · '+(u.is_active?'Aktivní':'Deaktivovaný')+'</span></div>'+(u.role==='admin'?'':('<button type="button" onclick="toggleUser('+esc(JSON.stringify(u.id))+','+(!u.is_active)+',this)">'+(u.is_active?'Deaktivovat':'Aktivovat')+'</button>'))+'</div>').join('')}catch(e){target.textContent=e.message}}
async function toggleUser(id,activate,opener){const name=opener?.closest('.user-row')?.querySelector('b')?.textContent||'uživatel';if(!await askConfirmation({title:activate?'Aktivovat účet?':'Deaktivovat účet?',message:activate?'Účet „'+name+'“ se bude moci znovu přihlásit.':'Účet „'+name+'“ se deaktivuje a odhlásí. Později ho můžeš znovu aktivovat.',accept:activate?'Aktivovat účet':'Deaktivovat účet',cancel:'Zpět',danger:!activate,opener}))return;try{await api(activate?'enable-user':'disable-user','POST',{userId:id});await loadAdminUsers()}catch(e){$('newUserStatus').textContent=e.message}}
async function logout(){await api('logout','POST');location.reload()}
function pushInfo(message){let x=document.getElementById('pushMessage');if(x)x.textContent=message}
function pushBadge(message){let x=document.getElementById('pushStatus');if(x)x.textContent=message}
function isIOS(){return /iPhone|iPad|iPod/i.test(navigator.userAgent)}
function installed(){return window.navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches}
function b64Key(s){let x=(s+'='.repeat((4-s.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(x);return Uint8Array.from(raw,c=>c.charCodeAt(0))}
async function pushReg(){if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('Tento prohlížeč push notifikace nepodporuje.');await navigator.serviceWorker.register('/sw.js',{scope:'/'});return navigator.serviceWorker.ready}
async function refreshPushStatus(){if(!('Notification' in window)){pushBadge('Nepodporováno');return}if(Notification.permission!=='granted'){pushBadge('Neaktivní');return}try{let reg=await pushReg(),sub=await reg.pushManager.getSubscription();pushBadge(sub?'Zapnuto':'Neaktivní')}catch{pushBadge('Neaktivní')}}
async function enableNotifications(){try{if(isIOS()&&!installed())throw Error('Na iPhonu nejprve otevři Kylo v Safari, klepni na Sdílet → Přidat na plochu a spusť aplikaci z plochy.');if(!('Notification' in window)||!('PushManager' in window))throw Error('Prohlížeč push notifikace nepodporuje.');if(Notification.permission==='denied')throw Error('Oznámení jsou blokovaná. Povol je v nastavení iPhonu pro Kylo.');let permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Bez povolení oznámení nelze zapnout.');pushInfo('Aktivuji oznámení…');let reg=await pushReg();let key=await apiPush('public-key');let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64Key(key.publicKey)});await apiPush('subscribe','POST',{subscription:sub.toJSON()});pushBadge('Zapnuto');pushInfo('Notifikace jsou aktivní. Připomenutí se řídí nastavením akcí a připomínek.');}catch(e){pushInfo(e.message);await refreshPushStatus()}}
async function apiPush(action,method='GET',body){let r=await fetch('/api/push?action='+action,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});let data=await r.json().catch(()=>({error:'Chyba spojení'}));if(!r.ok)throw new Error(data.error||'Chyba push služby');return data}
async function testNotification(){try{let r=await apiPush('test','POST',{});pushInfo('Testovací push byl odeslán na '+r.sent+' zařízení.');}catch(e){pushInfo(e.message)}}
async function disableNotifications(){try{let reg=await pushReg(),sub=await reg.pushManager.getSubscription();if(sub){await apiPush('unsubscribe','POST',{endpoint:sub.endpoint});await sub.unsubscribe()}pushBadge('Neaktivní');pushInfo('Push notifikace na tomto zařízení byly vypnuty.')}catch(e){pushInfo(e.message)}}

const reminderLabels=()=>state.types.map(t=>[t.slug,t.icon+' '+t.name]);
let prefs=null;
async function loadVersion(){try{let r=await fetch('/api/version',{cache:'no-store'}),x=await r.json();$('appVersion').textContent='Verze '+x.version+(x.automatic?'':' · náhradní číslo')}catch{$('appVersion').textContent='Verze 1.2.0'}}
async function loadPrefs(){const el=$('notificationSettings');if(!el)return;el.innerHTML='<p class="sub">Načítám nastavení připomínek…</p>';try{prefs=await apiSettings('');renderPrefs()}catch(e){el.innerHTML='<p class="sub" style="color:#b22">'+esc(e.message)+'</p>'}}
async function apiSettings(action,method='GET',body){const r=await fetch('/api/settings'+(action?'?action='+action:''),{method,headers:{'Content-Type':'application/json'},credentials:'same-origin',body:body?JSON.stringify(body):undefined});const x=await r.json().catch(()=>({error:'Chyba spojení'}));if(!r.ok)throw new Error(x.error||'Chyba nastavení');return x}
function renderPrefs(){const el=$('notificationSettings');if(!prefs||!el)return;const days=[30,14,7,3,1,0];let rows=reminderLabels().map(([slug,label])=>{const arr=prefs.reminders[slug]??state.types.find(t=>t.slug===slug)?.reminder_offsets??[];return '<div style="border-top:1px solid #eee;padding:12px 0"><b>'+esc(label)+'</b><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">'+[...new Set([...days,...arr])].sort((a,b)=>b-a).map(d=>'<label style="font-size:12px;display:flex;align-items:center;gap:3px;background:#f4f7f2;padding:6px;border-radius:10px"><input type="checkbox" data-type="'+esc(slug)+'" data-days="'+d+'" '+(arr.includes(d)?'checked':'')+'>'+(d===0?'V den':d+' dní')+'</label>').join('')+'</div></div>'}).join('');
el.innerHTML='<h3>⚙️ Nastavení připomínek</h3><label class="setting"><span>Zapnout připomínky</span><input id="prefEnabled" type="checkbox" '+(prefs.enabled?'checked':'')+'></label><label class="setting"><span>Opakovat prošlé termíny denně</span><input id="prefOverdue" type="checkbox" '+(prefs.repeatOverdue?'checked':'')+'></label><div class="setting"><span>Preferovaný čas</span><select id="prefTime" class="input" style="width:112px">'+['08:00','09:00','10:00','18:00','20:00'].map(t=>'<option value="'+t+'" '+(prefs.preferredTime===t?'selected':'')+'>'+t+'</option>').join('')+'</select></div><p class="sub">'+esc(prefs.deliveryNote)+'</p><h4>Upozornění podle typu péče</h4>'+rows+'<button class="primary" onclick="savePrefs()">Uložit nastavení</button><p class="sub" id="prefResult"></p>'}
async function savePrefs(){try{const reminders={};for(const [slug] of reminderLabels()){reminders[slug]=[...document.querySelectorAll('input[data-type="'+esc(slug)+'"]:checked')].map(x=>Number(x.dataset.days)).sort((a,b)=>b-a)}const payload={enabled:$('prefEnabled').checked,repeatOverdue:$('prefOverdue').checked,preferredTime:$('prefTime').value,reminders};await apiSettings('','POST',payload);prefs={...prefs,...payload};$('prefResult').textContent='Nastavení uloženo ✓'}catch(e){$('prefResult').textContent=e.message}}
init();