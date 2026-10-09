const {test,expect}=require('@playwright/test');const {mockApi}=require('./mock-api.cjs');
test.beforeEach(async({page})=>{await mockApi(page);await page.goto('/')});
test('approved login design supports password visibility and signing in with Enter',async({page})=>{
 await expect(page.getByRole('heading',{name:'Vítej zpět'})).toBeVisible();await expect(page.locator('#loginForm')).toBeVisible();expect(await page.locator('.login-portrait').evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true);
 await page.getByLabel('Uživatelské jméno',{exact:true}).fill('e2e-owner');const password=page.getByLabel('Heslo',{exact:true});await password.fill('e2e-test-password');
 await page.getByRole('button',{name:'Zobrazit heslo',exact:true}).click();await expect(password).toHaveAttribute('type','text');await expect(password).toHaveValue('e2e-test-password');
 await page.getByRole('button',{name:'Skrýt heslo',exact:true}).click();await expect(password).toHaveAttribute('type','password');await password.press('Enter');
 await expect(page.locator('#home')).toBeVisible();await expect(page.locator('#login')).not.toBeVisible();await expect(page.locator('#appShell')).not.toHaveClass(/login-shell/);await expect(page.locator('.nav')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('failed login announces the error and allows a retry',async({page})=>{
 await page.getByLabel('Uživatelské jméno',{exact:true}).fill('e2e-owner');await page.getByLabel('Heslo',{exact:true}).fill('invalid');await page.locator('#loginAction').click();await expect(page.locator('#loginError')).toContainText('Nesprávné');await expect(page.locator('#loginError')).toHaveAttribute('role','alert');await expect(page.locator('#loginAction')).toBeEnabled();
 await page.getByLabel('Heslo',{exact:true}).fill('e2e-test-password');await page.locator('#loginAction').click();await expect(page.locator('#home')).toBeVisible();
});
test('pending login prevents duplicate submission and keeps the form usable on a narrow screen',async({page})=>{
 await page.setViewportSize({width:320,height:640});let release;const gate=new Promise(resolve=>release=resolve);let requests=0;
 await page.route('**/api?action=login',async route=>{requests++;await gate;await route.fallback()});
 try{
  await page.getByLabel('Uživatelské jméno',{exact:true}).fill('e2e-owner');await page.getByLabel('Heslo',{exact:true}).fill('e2e-test-password');await page.locator('#loginAction').click();await expect(page.locator('#loginAction')).toBeDisabled();await expect(page.locator('#loginActionLabel')).toHaveText('Přihlašuji…');
  await page.locator('#loginForm').evaluate(form=>form.requestSubmit());expect(requests).toBe(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{release()}
 await expect(page.locator('#home')).toBeVisible();
});
