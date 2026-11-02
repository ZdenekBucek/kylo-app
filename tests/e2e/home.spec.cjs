const {test,expect}=require('@playwright/test');const {mockApi}=require('./mock-api.cjs');let db;
test.beforeEach(async({page})=>{await page.clock.install({time:new Date('2026-10-08T12:00:00+02:00')});db=await mockApi(page);await page.goto('/');await page.locator('#login input[autocomplete="username"]').fill('e2e-owner');await page.locator('#login input[autocomplete="current-password"]').fill('e2e-test-password');await page.locator('#loginAction').click();await expect(page.locator('#inside')).toBeVisible()});
test('header shows the nearest care and actual counts without a duplicated upcoming list',async({page})=>{
 await expect(page.locator('#homeDate')).toHaveText('Čtvrtek, 8. října 2026');await expect(page.locator('#careStatus')).toHaveText('31. října');await expect(page.locator('#homeCareProduct')).toHaveText('Frontline Spot On');await expect(page.locator('#homeCareCountdown')).toHaveText('Za 23 dní');
 const stats=page.locator('#homeStats b');await expect(stats).toHaveText(['0','2','2']);await expect(page.locator('#upcoming')).toHaveCount(0);await expect(page.locator('#home')).not.toContainText('Termíny se načítají z databáze');
 await page.locator('#homeCareButton').click();await expect(page.locator('#calendar')).toBeVisible();await expect(page.locator('#monthRows .highlighted')).toContainText('Frontline Spot On');
});
test('header date and countdown advance with the current date',async({page})=>{
 await page.clock.runFor(86400000);await page.locator('nav button').filter({hasText:'Historie'}).click();await page.locator('nav button').filter({hasText:'Domů'}).click();await expect(page.locator('#homeDate')).toHaveText('Pátek, 9. října 2026');await expect(page.locator('#homeCareCountdown')).toHaveText('Za 22 dní');
});
test('no planned care has an honest empty state and no inactive calendar link',async({page})=>{
 db.records=[];db.plans=[];await page.reload();await expect(page.locator('#inside')).toBeVisible();await expect(page.locator('#careStatus')).toHaveText('Žádné termíny');await expect(page.locator('#homeCareButton')).toBeDisabled();await expect(page.locator('#homeCareDetails')).not.toBeVisible();await expect(page.locator('#homeCareCountdown')).not.toBeVisible();await expect(page.locator('#homeStats b')).toHaveText(['0','0','0']);
});
test('overdue care remains visible and long custom names fit the mobile header',async({page})=>{
 db.records[1].next_due_on='2026-10-06';db.records[1].product='Vlastní naplánovaná péče s delším názvem přípravku';await page.reload();await expect(page.locator('#inside')).toBeVisible();await expect(page.locator('#homeCareHeading')).toHaveText('Péče po termínu');await expect(page.locator('#homeCareCountdown')).toHaveText('2 dny po termínu');await expect(page.locator('#careStatus')).toHaveText('6. října');await expect(page.locator('#homeStats b').first()).toHaveText('1');
 const image=page.locator('.home-portrait');expect(await image.evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Tractive uses the same profile icon on both screens',async({page})=>{
 const home=page.locator('#home .profile-gps-icon'),profile=page.locator('#profile .profile-gps-icon');
 expect(await home.innerHTML()).toBe(await profile.innerHTML());expect(await home.evaluate(e=>getComputedStyle(e).color)).toBe(await profile.evaluate(e=>getComputedStyle(e).color));await expect(home.locator('svg')).toBeVisible();
});
test('weight points show their date and weight with touch, click and keyboard',async({page})=>{
 db.records.push({id:'old-weight',slug:'weight',type_name:'Vážení',product:'Starší vážení',event_date:'2026-09-01',weight_kg:7.9});await page.reload();await expect(page.locator('#inside')).toBeVisible();
 const first=page.locator('#weightGraph [data-weight-index="0"]'),last=page.locator('#weightGraph [data-weight-index="1"]');await expect(first).toHaveAttribute('aria-label','1. září 2026: 7,9 kg');
 if(test.info().project.name.includes('webkit'))await first.tap();else await first.click();
 await expect(page.locator('#weightPointDetails')).toHaveText('1. září 2026 · 7,9 kg');await expect(first).toHaveAttribute('aria-pressed','true');await first.press('ArrowRight');await expect(last).toBeFocused();await expect(page.locator('#weightPointDetails')).toHaveText('8. října 2026 · 7,7 kg');await expect(first).toHaveAttribute('aria-pressed','false');await last.press('Home');await expect(page.locator('#weightPointDetails')).toHaveText('1. září 2026 · 7,9 kg');
});
test('changing the chart range clears a selected measurement that no longer belongs to it',async({page})=>{
 db.records.push({id:'year-old-weight',slug:'weight',event_date:'2025-10-01',weight_kg:8.2});await page.reload();await expect(page.locator('#inside')).toBeVisible();await page.locator('#weightGraph [data-weight-index="0"]').click();await expect(page.locator('#weightPointDetails')).toContainText('8,2 kg');await page.locator('[data-weight-range="6m"]').click();await expect(page.locator('#weightGraph [data-weight-index]')).toHaveCount(1);await expect(page.locator('#weightPointDetails')).toHaveText('Klepni na bod pro datum a hmotnost.');await page.locator('#weightGraph [data-weight-index="0"]').click();await expect(page.locator('#weightPointDetails')).toHaveText('8. října 2026 · 7,7 kg');
});
test('tapping a visible point selects the nearest measurement when touch areas overlap',async({page})=>{
 db.records=[{id:'dense-a',slug:'weight',event_date:'2026-09-01',weight_kg:7.7},{id:'dense-b',slug:'weight',event_date:'2026-09-02',weight_kg:7.7},{id:'dense-c',slug:'weight',event_date:'2026-10-08',weight_kg:7.7}];await page.reload();await expect(page.locator('#inside')).toBeVisible();
 const dot=page.locator('#weightGraph [data-weight-index="0"] circle[r="5"]');await dot.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));const b=await dot.boundingBox();if(test.info().project.name.includes('webkit'))await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);else await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await expect(page.locator('#weightPointDetails')).toHaveText('1. září 2026 · 7,7 kg');
});
