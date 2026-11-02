const {test,expect}=require('@playwright/test');const {mockApi}=require('./mock-api.cjs');
test('saved session opens the app without displaying the login while its check is pending',async({page})=>{
 const db=await mockApi(page);db.signedIn=true;let release;const gate=new Promise(r=>release=r);
 await page.route('**/api?action=state',async route=>{await gate;await route.fallback()});
 try{await page.goto('/');await expect(page.locator('#startup')).toBeVisible();await expect(page.locator('#login')).not.toBeVisible();await expect(page.locator('#inside')).not.toBeVisible()}finally{release()}
 await expect(page.locator('#inside')).toBeVisible();await expect(page.locator('#startup')).not.toBeVisible();await expect(page.locator('#login')).not.toBeVisible();
});
test('login appears only after the server rejects the saved session',async({page})=>{
 await mockApi(page);let release;const gate=new Promise(r=>release=r);await page.route('**/api?action=state',async route=>{await gate;await route.fallback()});
 try{await page.goto('/');await expect(page.locator('#startup')).toBeVisible();await expect(page.locator('#login')).not.toBeVisible()}finally{release()}
 await expect(page.locator('#login')).toBeVisible();await expect(page.locator('#startup')).not.toBeVisible();await expect(page.locator('#inside')).not.toBeVisible();
});
test('a startup error offers retry without presenting a misleading login',async({page})=>{
 const db=await mockApi(page);db.signedIn=true;let failing=true;
 await page.route('**/api?action=state',async route=>failing?route.fulfill({status:503,contentType:'application/json',body:'{"error":"Dočasně nedostupné"}'}):route.fallback());
 await page.goto('/');await expect(page.locator('#startupMessage')).toContainText('nepodařilo načíst');await expect(page.locator('#startupRetry')).toBeVisible();await expect(page.locator('#login')).not.toBeVisible();failing=false;await page.locator('#startupRetry').click();await expect(page.locator('#inside')).toBeVisible();await expect(page.locator('#startup')).not.toBeVisible();
});
