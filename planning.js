// Shared action definitions drive both completed records and calendar plans.
let selectedCalendarDate=null,entryMode='record',entryDate=null,sheetFocus=null;
const offsetsText=values=>(values||[]).join(', ');
function readOffsets(value){
  if(!value.trim())return [];
  const parts=value.split(',').map(s=>s.trim());
  if(parts.length>12||parts.some(s=>!/^\d+$/.test(s)||Number(s)>365))throw Error('Zadej dny před termínem oddělené čárkou (0 až 365).');
  return [...new Set(parts.map(Number))].sort((a,b)=>b-a);
}
const intervalText=n=>n?'Každých '+n+' dní':'Bez opakování';
function calendarEvents(){
  return [...events(),...state.records.map(r=>({...r,due:r.event_date,recordId:r.id}))].sort((a,b)=>a.due.localeCompare(b.due));
}
function drawMonthOverview(){
  const month=view.getFullYear()+'-'+String(view.getMonth()+1).padStart(2,'0');
  $('monthRows').innerHTML=calendarEvents().filter(e=>e.due.startsWith(month)).map(e=>{
    const selected=e.due===selectedCalendarDate;
    const target=e.recordId?'data-record="'+esc(e.recordId)+'"':'data-event="'+esc(e.planId||e.slug)+'" data-plan="'+(e.planId?'1':'0')+'"';
    return '<button class="care kylo-action month-event '+(selected?'highlighted':'')+'" '+target+' data-calendar-date="'+e.due+'" '+(selected?'aria-current="date"':'')+'><span class="ico">'+esc(e.icon||'🐾')+'</span><span class="grow"><span class="name">'+esc(e.product||e.title||e.type_name)+'</span><span class="sub">'+fmt(e.due)+' · '+(e.recordId?'Provedeno':'Plánováno')+(e.dose?' · '+esc(e.dose):'')+'</span></span><span aria-hidden="true">›</span></button>';
  }).join('')||'<p class="sub calendar-empty">V tomto měsíci zatím nejsou žádné termíny.</p>';
}
drawCalendar=function(){
  const y=view.getFullYear(),m=view.getMonth(),count=new Date(y,m+1,0).getDate(),pad=(new Date(y,m,1).getDay()+6)%7,ev=calendarEvents();
  $('monthTitle').textContent=view.toLocaleDateString('cs-CZ',{month:'long',year:'numeric'});
  $('calendarDays').innerHTML=['Po','Út','St','Čt','Pá','So','Ne'].map(x=>'<div class="sub">'+x+'</div>').join('')+Array(pad).fill('<span></span>').join('')+Array.from({length:count},(_,i)=>{
    const d=day(new Date(y,m,i+1)),selected=d===selectedCalendarDate,isToday=d===day(new Date());
    return '<button class="day '+(ev.some(x=>x.due===d)?'dot ':'')+(isToday?'today ':'')+(selected?'selected':'')+'" '+(isToday?'aria-current="date" ':'')+'aria-label="'+fmt(d)+(isToday?', dnes':'')+'" aria-pressed="'+selected+'" data-date="'+d+'" onclick="showDay(\''+d+'\')">'+(i+1)+'</button>';
  }).join('');
  $('calendarSelection').textContent=selectedCalendarDate?fmt(selectedCalendarDate):'Vyber den v kalendáři';
  $('calendarPlan').disabled=!selectedCalendarDate;
  drawMonthOverview();
};
moveMonth=function(n){view.setMonth(view.getMonth()+n);selectedCalendarDate=null;drawCalendar()};
showDay=function(d){
  selectedCalendarDate=d;drawCalendar();
  document.querySelector('#monthRows .highlighted')?.scrollIntoView({block:'nearest',behavior:'smooth'});
};
function goToToday(){
  const now=new Date();view=new Date(now.getFullYear(),now.getMonth(),1);
  selectedCalendarDate=day(now);drawCalendar();
}
function planSelectedDay(){if(selectedCalendarDate)openSheet('plan',selectedCalendarDate)}
function dismissSheet(){
  $('sheet').classList.remove('show');document.body.style.overflow='';sheetFocus?.focus();
}
closeSheet=function(e){if(e.target.id==='sheet')dismissSheet()};
openSheet=function(mode='record',date=null){
  if(!$('sheet').classList.contains('show'))sheetFocus=document.activeElement?.matches('button')?document.activeElement:(date?$('calendarPlan'):document.querySelector('.nav .plus'));entryMode=mode;entryDate=date||day(new Date());
  $('sheet').classList.add('show');document.body.style.overflow='hidden';
  $('recordFields').hidden=true;$('typeOptions').hidden=false;
  $('sheetTitle').textContent=mode==='plan'?'Naplánovat akci':'Přidat péči';
  $('entryModes').hidden=false;
  document.querySelectorAll('[data-entry-mode]').forEach(b=>{b.classList.toggle('selected',b.dataset.entryMode===mode);b.setAttribute('aria-pressed',String(b.dataset.entryMode===mode))});
  $('sheetIntro').textContent=mode==='plan'?'Vyber akci pro '+fmt(entryDate)+'.':'Co jsi pro Kyla udělal?';
  $('typeOptions').innerHTML=state.types.map(t=>'<button type="button" class="action-option" data-pick-type="'+esc(t.slug)+'"><span class="action-icon">'+esc(t.icon)+'</span><span><b>'+esc(t.name)+'</b><small>'+esc(t.default_dose||intervalText(t.default_interval_days))+'</small></span><span class="option-arrow" aria-hidden="true">›</span></button>').join('');
  $('sheetClose').focus();
};
function changeEntryMode(mode){openSheet(mode,entryDate)}
pick=function(name){
  kind=state.types.find(t=>t.slug===name)||state.types.find(t=>name===t.icon)||state.types.find(t=>name.includes(t.icon))||state.types.find(t=>t.slug==='other');
  if(!kind)return;
  const date=entryDate||day(new Date()),plan=entryMode==='plan',simple=['weight','vet-check'].includes(kind.slug),latest=state.records.find(r=>r.slug===kind.slug);
  $('sheetTitle').textContent=kind.name;$('sheetIntro').textContent=plan?'Plán na '+fmt(date):'Záznam provedené péče';
  $('typeOptions').hidden=true;$('entryModes').hidden=true;$('recordFields').hidden=false;
  $('recordFields').innerHTML='<button type="button" class="back-action" onclick="openSheet(entryMode,entryDate)">‹ Vybrat jinou akci</button><form id="recordForm"><label>Datum<input id="eventDate" type="date" class="input" required value="'+date+'"></label><label>'+ (plan?'Název akce':'Přípravek / úkon')+'<input id="product" class="input" maxlength="200" required value="'+esc(plan?kind.name:latest?.product||kind.name)+'"></label>'+(!simple||plan?'<label>Dávka <span class="muted">(volitelné)</span><input id="dose" class="input" maxlength="200" value="'+esc(kind.default_dose||'')+'" placeholder="Např. 1 tableta"></label>':'')+(!plan&&kind.slug==='weight'?'<label>Hmotnost (kg)<input id="kg" type="number" min="0.1" max="100" step="0.01" class="input" required></label>':'')+(plan?'<label>Další termín za (dní)<input id="planInterval" class="input" type="number" min="0" max="3650" step="1" required value="'+(kind.default_interval_days||0)+'"></label><p class="field-help">0 = jednorázová akce. Další termín se vypočítá po potvrzení provedení.</p><label>Upozornění před termínem (dní)<input id="planReminders" class="input" value="'+esc(offsetsText(kind.reminder_offsets||[7,1,0]))+'" placeholder="7, 1, 0"></label><p class="field-help">Odděl čárkou. 0 = v den akce, prázdné = bez připomínek.</p>':'<label>Další termín<input id="nextDue" type="date" class="input"></label>')+'<label>Poznámka<textarea id="notes" class="input" maxlength="2000" rows="2"></textarea></label><button type="submit" class="primary">'+(plan?'Naplánovat akci':'Uložit záznam')+'</button><p id="saveError" class="form-error" role="alert"></p></form>';
  if(!plan&&kind.default_interval_days)$('nextDue').value=plus(date,kind.default_interval_days);
  if(!plan)$('eventDate').onchange=()=>{if(kind.default_interval_days)$('nextDue').value=plus($('eventDate').value,kind.default_interval_days)};
  $('recordForm').onsubmit=save;$('product').focus();
};
async function careRequest(action,body){
  const r=await fetch('/api/care?action='+action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const x=await r.json();if(!r.ok)throw Error(x.error||'Akci se nepodařilo uložit');return x;
}
save=async function(e){
  e.preventDefault();const button=$('recordForm').querySelector('[type="submit"]');button.disabled=true;
  try {
    const date=$('eventDate').value;
    if(entryMode==='plan'){
      await careRequest('plan',{careTypeId:kind.id,date,name:$('product').value,dose:$('dose').value,intervalDays:Number($('planInterval').value),reminderOffsets:readOffsets($('planReminders').value),notes:$('notes').value});
      dismissSheet();view=new Date(date+'T12:00:00');view.setDate(1);selectedCalendarDate=date;
      await refresh();go('calendar',document.querySelectorAll('.nav button:not(.plus)')[2]);
    } else {
      await api('record','POST',{type:kind.slug,date,product:$('product').value,dose:$('dose')?.value||'',weight:$('kg')?.value||null,nextDue:$('nextDue').value||null,notes:$('notes').value});
      dismissSheet();await refresh();go('history',document.querySelectorAll('.nav button:not(.plus)')[1]);
    }
  }catch(x){$('saveError').textContent=x.message;button.disabled=false}
};
function renderActions(){
  $('actionDefinitions').innerHTML=state.types.map(t=>'<button type="button" class="action-option" data-edit-type="'+esc(t.id)+'"><span class="action-icon">'+esc(t.icon)+'</span><span><b>'+esc(t.name)+'</b><small>'+esc([t.default_dose,intervalText(t.default_interval_days)].filter(Boolean).join(' · '))+'</small></span><span class="option-arrow" aria-hidden="true">›</span></button>').join('');
  $('actionAdmin').hidden=state.user?.role!=='admin';
}
function editAction(id){
  if(state.user?.role!=='admin')return;
  const t=state.types.find(t=>t.id===id);
  $('actionEditor').hidden=false;$('actionId').value=t?.id||'';$('actionName').value=t?.name||'';$('actionDose').value=t?.default_dose||'';$('actionInterval').value=t?.default_interval_days||0;$('actionReminders').value=offsetsText(t?.reminder_offsets||[7,1,0]);
  $('actionEditorTitle').textContent=t?'Upravit akci':'Nová akce';$('actionFeedback').textContent='';$('actionName').focus();
}
async function saveAction(e){
  e.preventDefault();const button=$('actionSave');button.disabled=true;
  try{
    const id=$('actionId').value;
    const r=await fetch('/api/actions',{method:id?'PUT':'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,name:$('actionName').value,dose:$('actionDose').value,intervalDays:Number($('actionInterval').value),reminderOffsets:readOffsets($('actionReminders').value)})});
    const x=await r.json();if(!r.ok)throw Error(x.error||'Akci se nepodařilo uložit');
    await refresh();$('actionEditor').hidden=true;$('actionFeedback').textContent='Akce uložena. Teď ji můžeš vybrat v kalendáři.';
  }catch(x){$('actionFeedback').textContent=x.message}finally{button.disabled=false}
}
const renderBeforePlanning=render;
render=function(){renderBeforePlanning();drawCalendar();renderActions()};
document.addEventListener('click',e=>{
  const pickButton=e.target.closest('[data-pick-type]');if(pickButton)pick(pickButton.dataset.pickType);
  const editButton=e.target.closest('[data-edit-type]');if(editButton)editAction(editButton.dataset.editType);
});
document.addEventListener('keydown',e=>{
  if(!$('sheet').classList.contains('show'))return;
  if(e.key==='Escape')dismissSheet();
  if(e.key==='Tab'){
    const buttons=[...$('sheet').querySelectorAll('button,input,textarea,select')].filter(x=>!x.disabled&&x.getClientRects().length),first=buttons[0],last=buttons.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }
});

// Let the browser handle vertical scrolling and pinch zoom; horizontal swipes change month.
(()=>{
  const surface=$('calendarSurface');let gesture=null,suppressClickUntil=0;
  surface.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch'||!e.isPrimary){gesture=null;return}
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY};
  },{passive:true});
  surface.addEventListener('pointercancel',()=>{gesture=null},{passive:true});
  surface.addEventListener('pointerup',e=>{
    if(!gesture||e.pointerId!==gesture.id)return;
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;gesture=null;
    if(Math.abs(dx)<50||Math.abs(dx)<=Math.abs(dy)*1.5)return;
    suppressClickUntil=Date.now()+400;
    moveMonth(dx<0?1:-1);
  },{passive:true});
  surface.addEventListener('click',e=>{
    if(Date.now()<suppressClickUntil){e.preventDefault();e.stopPropagation()}
  },true);
})();
