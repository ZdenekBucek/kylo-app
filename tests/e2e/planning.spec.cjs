const {test,expect}=require('@playwright/test');const {mockApi}=require('./mock-api.cjs');
let db;
test.beforeEach(async({page})=>{await page.clock.install({time:new Date('2026-10-08T12:00:00+02:00')});db=await mockApi(page);await page.goto('/');await page.locator('#login input[autocomplete="username"]').fill('e2e-owner');await page.locator('#login input[autocomplete="current-password"]').fill('e2e-test-password');await page.locator('#loginAction').click();await expect(page.locator('#inside')).toBeVisible()});
const nav=(page,label)=>page.locator('nav.nav button').filter({hasText:label}).click();
test('custom action is saved, planned on selected day and completed with recurrence',async({page})=>{
 await nav(page,'Profil');await page.locator('#actionSettings summary').click();await page.getByRole('button',{name:'Přidat vlastní akci'}).click();
 await page.locator('#actionName').fill('Péče o srst');await page.locator('#actionDose').fill('2 kapky');await page.locator('#actionInterval').fill('21');await page.locator('#actionReminders').fill('5, 0');await page.locator('#actionSave').click();
 await expect(page.locator('#actionFeedback')).toContainText('Akce uložena');expect(db.types.at(-1).reminder_offsets).toEqual([5,0]);
 await nav(page,'Kalendář');await page.locator('[data-date="2026-10-20"]').click();await page.locator('#calendarPlan').click();await page.locator('#typeOptions button').filter({hasText:'Péče o srst'}).click();
 await expect(page.locator('#eventDate')).toHaveValue('2026-10-20');await expect(page.locator('#dose')).toHaveValue('2 kapky');await expect(page.locator('#planInterval')).toHaveValue('21');await expect(page.locator('#planReminders')).toHaveValue('5, 0');
 await page.locator('#recordForm button[type="submit"]').click();await expect(page.locator('#sheet')).not.toBeVisible();
 const selected=page.locator('#monthRows .highlighted');await expect(selected).toHaveCount(1);await expect(selected).toContainText('Péče o srst');await expect(page.locator('#monthRows')).toContainText('Frontline');
 await page.reload();await expect(page.locator('#inside')).toBeVisible();await nav(page,'Kalendář');await page.locator('[data-date="2026-10-20"]').click();await expect(page.locator('#monthRows .highlighted')).toContainText('Péče o srst');
 await page.locator('#monthRows .highlighted').click();await page.locator('#doneDate').fill('2026-10-23');await expect(page.locator('#doneNext')).toContainText('13. listopadu 2026');await page.locator('#doneForm .primary').click();await expect(page.locator('#doneForm')).not.toBeVisible();
 expect(db.records[0]).toMatchObject({dose:'2 kapky',event_date:'2026-10-23',next_due_on:'2026-11-13',reminder_offsets:[5,0]});
 await nav(page,'Historie');await expect(page.locator('#historyRows [data-record]').first()).toContainText('Péče o srst');
});
test('selected day highlights the monthly entry without a duplicate details card',async({page})=>{
 await nav(page,'Kalendář');await page.locator('[data-date="2026-10-31"]').click();await expect(page.locator('#monthRows .highlighted')).toContainText('Frontline');await expect(page.locator('#calendar .name').filter({hasText:'Frontline'})).toHaveCount(1);
 await page.locator('[data-date="2026-10-08"]').click();await expect(page.locator('#monthRows .highlighted')).toContainText('Domácí vážení');await expect(page.locator('#calendarDays [aria-pressed="true"]')).toHaveCount(1);
 await page.getByRole('button',{name:'Další měsíc'}).click();await expect(page.locator('#monthRows .highlighted')).toHaveCount(0);await expect(page.locator('#calendarPlan')).toBeDisabled();
});
test('bottom panel switches entry mode and supports closing with Escape',async({page})=>{
 await page.getByRole('button',{name:'Přidat péči',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.locator('[data-entry-mode="plan"]').click();await page.locator('#typeOptions button').filter({hasText:'Odčervení'}).click();await expect(page.locator('#planInterval')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('#sheet')).not.toBeVisible();await expect(page.getByRole('button',{name:'Přidat péči',exact:true})).toBeFocused();
});
test('one-off plan can be cancelled without creating a record',async({page})=>{
 await nav(page,'Kalendář');await page.locator('[data-date="2026-10-12"]').click();await page.locator('#calendarPlan').click();await page.locator('#typeOptions button').filter({hasText:'Veterinární návštěva'}).click();await page.locator('#planInterval').fill('0');await page.locator('#planReminders').fill('');await page.locator('#recordForm button[type="submit"]').click();
 expect(db.plans.at(-1)).toMatchObject({interval_days:0,reminder_offsets:[]});await page.locator('#monthRows .highlighted').click();await page.locator('#cancelPlan').click();await page.locator('#confirmAccept').click();await expect(page.locator('#monthRows .highlighted')).toHaveCount(0);expect(db.records).toHaveLength(2);
});
test('mobile panel and calendar load their styles without horizontal overflow',async({page})=>{
 await nav(page,'Kalendář');await page.locator('[data-date="2026-10-31"]').click();expect(await page.locator('#calendarDays [aria-pressed="true"]').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(49, 93, 66)');
 await page.getByRole('button',{name:'Přidat péči',exact:true}).click();expect(await page.locator('.action-option').first().evaluate(e=>getComputedStyle(e).display)).toBe('flex');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('today stays marked when another day is selected and Today returns from other months',async({page})=>{
 await nav(page,'Kalendář');const today=page.locator('#calendarDays [data-date="2026-10-08"]');await expect(today).toHaveAttribute('aria-current','date');await expect(today).toHaveClass(/today/);
 await page.locator('[data-date="2026-10-31"]').click();await expect(today).toHaveAttribute('aria-current','date');await expect(today).toHaveAttribute('aria-pressed','false');
 await page.getByRole('button',{name:'Další měsíc'}).click();await expect(page.locator('#calendarDays .today')).toHaveCount(0);
 await page.getByRole('button',{name:'Dnes',exact:true}).click();await expect(page.locator('#monthTitle')).toContainText('říjen 2026');await expect(today).toHaveAttribute('aria-pressed','true');await expect(page.locator('#monthRows .highlighted')).toContainText('Domácí vážení');
});
async function swipe(page,dx,dy=0,options={}){
 if(test.info().project.name==='desktop-chromium'&&!options.cancelled&&!options.multitouch){
  const r=await page.locator('#calendarSurface').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2,cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  for(let i=1;i<=4;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/4,y:y+dy*i/4,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();return;
 }
 await page.locator('#calendarSurface').evaluate((surface,{dx,dy,options})=>{
  const r=surface.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,p={bubbles:true,pointerId:1,pointerType:'touch',isPrimary:true,clientX:x,clientY:y};
  surface.dispatchEvent(new PointerEvent('pointerdown',p));
  if(options.multitouch)surface.dispatchEvent(new PointerEvent('pointerdown',{...p,pointerId:2,isPrimary:false}));
  if(options.cancelled)surface.dispatchEvent(new PointerEvent('pointercancel',p));
  surface.dispatchEvent(new PointerEvent('pointerup',{...p,clientX:x+dx,clientY:y+dy}));
 },{dx,dy,options});
}
test('horizontal touch gestures move one month in each direction across year boundary',async({page})=>{
 await nav(page,'Kalendář');await swipe(page,-110,5);await expect(page.locator('#monthTitle')).toContainText('listopad 2026');await expect(page.locator('#monthRows')).toContainText('Preventivní veterinární prohlídka');
 await swipe(page,-110);await swipe(page,-110);await expect(page.locator('#monthTitle')).toContainText('leden 2027');
 await swipe(page,110);await expect(page.locator('#monthTitle')).toContainText('prosinec 2026');await expect(page.locator('#calendarDays [aria-pressed="true"]')).toHaveCount(0);
});
test('scrolling, small movements, cancelled gestures and multi-touch do not change month',async({page})=>{
 await nav(page,'Kalendář');await swipe(page,10,130);await swipe(page,20,2);await swipe(page,-110,0,{cancelled:true});await swipe(page,-110,0,{multitouch:true});await expect(page.locator('#monthTitle')).toContainText('říjen 2026');
 expect(await page.locator('#calendarSurface').evaluate(e=>getComputedStyle(e).touchAction)).toContain('pan-y');
 await page.locator('[data-date="2026-10-15"]').click();await expect(page.locator('[data-date="2026-10-15"]')).toHaveAttribute('aria-pressed','true');
});
