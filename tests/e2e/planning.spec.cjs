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
 await page.locator('#monthRows .highlighted').click();await page.locator('#doneDate').fill('2026-10-20');await page.locator('#doneForm .primary').click();await expect(page.locator('#doneForm')).not.toBeVisible();
 expect(db.records[0]).toMatchObject({dose:'2 kapky',next_due_on:'2026-11-10',reminder_offsets:[5,0]});
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
 expect(db.plans.at(-1)).toMatchObject({interval_days:0,reminder_offsets:[]});await page.locator('#monthRows .highlighted').click();page.once('dialog',d=>d.accept());await page.locator('#cancelPlan').click();await expect(page.locator('#monthRows .highlighted')).toHaveCount(0);expect(db.records).toHaveLength(2);
});
test('mobile panel and calendar load their styles without horizontal overflow',async({page})=>{
 await nav(page,'Kalendář');await page.locator('[data-date="2026-10-31"]').click();expect(await page.locator('#calendarDays [aria-pressed="true"]').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(49, 93, 66)');
 await page.getByRole('button',{name:'Přidat péči',exact:true}).click();expect(await page.locator('.action-option').first().evaluate(e=>getComputedStyle(e).display)).toBe('flex');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
