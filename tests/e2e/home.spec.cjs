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
