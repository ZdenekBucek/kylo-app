'use strict';
const {test, expect} = require('@playwright/test');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {mockApi} = require('./mock-api.cjs');
const {documentsDb} = require('../helpers/documents-db.cjs');

let db;
test.beforeEach(async ({page}) => {
  db = await documentsDb();
  const app = await mockApi(page);
  app.signedIn = true;
  await page.route('**/api/documents?**', async route => {
    const req = route.request();
    const {action, ...params} = Object.fromEntries(new URL(req.url()).searchParams);
    const body = req.method() === 'POST' ? req.postDataJSON() : undefined;
    const res = await db.call(action, {params, body, cookie: app.signedIn ? db.cookies[0] : ''});
    await route.fulfill({status: res.code, headers: res.headers, ...(Buffer.isBuffer(res.body) ? {body: res.body} : {json: res.body})});
  });
  await page.goto('/');
  await page.locator('#home').getByRole('button', {name: 'Dokumenty'}).click();
  await expect(page.locator('#docPick')).toBeEnabled();
});
test.afterEach(async () => { await db?.close(); });

async function folder(page, name) {
  await page.getByRole('button', {name: 'Nová složka', exact: true}).click();
  await page.getByLabel('Název', {exact: true}).fill(name);
  await page.getByRole('button', {name: 'Vytvořit složku'}).click();
  await page.locator('#docEntries').getByRole('button', {name, exact: true}).click();
  await expect(page.locator('#docPath [aria-current]')).toHaveText(name);
}

async function choose(page, button, file) {
  const chosen = page.waitForEvent('filechooser');
  await page.getByRole('button', {name: button, exact: true}).click();
  await (await chosen).setFiles(file);
  await expect(page.locator('#docEditor')).toBeVisible();
}

test('nested folders, named text document, reload, breadcrumb navigation and profile shortcut', async ({page}) => {
  await folder(page, 'Veterina');
  await folder(page, 'Listopad');
  const file = {name: 'kontrola.txt', mimeType: 'text/plain', buffer: Buffer.from('Výsledek kontroly.\nBez nálezu.')};
  await choose(page, 'Ze Souborů', file);
  await expect(page.locator('#docName')).toHaveValue('kontrola');
  await page.locator('#docName').fill('Kontrola u veterináře');
  await page.locator('#docDesc').fill('Listopadová návštěva');
  await page.getByRole('button', {name: 'Uložit dokument'}).click();
  await expect(page.locator('#docEntries')).toContainText('Kontrola u veterináře');
  await page.locator('#docPath').getByRole('button', {name: 'Dokumenty'}).click();
  await expect(page.locator('#docEntries')).not.toContainText('Kontrola u veterináře');
  await page.reload();
  await page.locator('nav.nav').getByRole('button', {name: 'Profil'}).click();
  await page.locator('#profile').getByRole('button', {name: 'Dokumenty'}).click();
  for (const name of ['Veterina','Listopad','Kontrola u veterináře']) await page.locator('#docEntries').getByRole('button', {name: new RegExp(name)}).click();
  await expect(page.locator('#docPreview pre')).toHaveText('Výsledek kontroly.\nBez nálezu.');
  await expect(page.locator('#docViewerDesc')).toHaveText('Listopadová návštěva');
  if (test.info().project.name === 'desktop-chromium') {
    const close = page.locator('#docViewer').getByRole('button', {name: 'Zavřít'});
    await close.focus();
    await close.press('Tab');
    await expect(page.getByRole('link', {name: 'Stáhnout originál'})).toBeFocused();
  }
  const download = page.waitForEvent('download');
  await page.getByRole('link', {name: 'Stáhnout originál'}).click();
  const original = await download;
  expect(original.suggestedFilename()).toBe('kontrola.txt');
  expect(readFileSync(await original.path())).toEqual(file.buffer);
  await page.locator('#docViewer').getByRole('button', {name: 'Zavřít'}).click();
  await page.locator('#docBack').click();
  await expect(page.locator('#profile')).toBeVisible();
});

test('photo capture offers rear camera and opens the saved image without a description', async ({page}) => {
  await expect(page.locator('#docCamera')).toHaveAttribute('capture', 'environment');
  await expect(page.locator('#docCamera')).toHaveAttribute('accept', 'image/*');
  await choose(page, 'Vyfotit', {name: 'foto.png', mimeType: 'image/png', buffer: readFileSync(join(__dirname, '../../icons/kylo-192.png'))});
  await page.getByRole('button', {name: 'Uložit dokument'}).click();
  await page.locator('#docEntries').getByRole('button', {name: /foto/}).click();
  const image = page.locator('#docPreview img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(el => el.naturalWidth)).toBe(192);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

function twoPagePdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',
    ...[5, 6].map(i => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents ' + i + ' 0 R >>'),
    ...['1 0 0', '0 1 0'].map(color => { const drawing = color + ' rg 0 0 200 200 re f'; return '<< /Length ' + drawing.length + ' >>\nstream\n' + drawing + '\nendstream'; })];
  let content = '%PDF-1.4\n', xref = '0000000000 65535 f \n';
  objects.forEach((obj, i) => { xref += String(content.length).padStart(10, '0') + ' 00000 n \n'; content += (i+1) + ' 0 obj\n' + obj + '\nendobj\n'; });
  return Buffer.from(content + 'xref\n0 7\n' + xref + 'trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n' + content.length + '\n%%EOF');
}

test('PDF viewer draws both pages and switches pages on mobile and desktop', async ({page}) => {
  await choose(page, 'Ze Souborů', {name: 'zprava.pdf', mimeType: 'application/pdf', buffer: twoPagePdf()});
  await page.getByRole('button', {name: 'Uložit dokument'}).click();
  await page.locator('#docEntries').getByRole('button', {name: /zprava/}).click();
  const canvas = page.locator('#docPreview canvas');
  const rgb = () => canvas.evaluate(el => [...el.getContext('2d').getImageData(5,5,1,1).data].slice(0,3));
  await expect(canvas).toHaveAttribute('aria-label', 'Strana 1 z 2');
  expect(await rgb()).toEqual([255,0,0]);
  await page.getByRole('button', {name: 'Další strana'}).click();
  await expect(canvas).toHaveAttribute('aria-label', 'Strana 2 z 2');
  expect(await rgb()).toEqual([0,255,0]);
  await expect(page.getByRole('button', {name: 'Další strana'})).toBeDisabled();
});

test('interrupted multipart upload resumes and unsupported formats retain the original', async ({page}) => {
  const contents = Buffer.alloc(800 * 1024, 33);
  let interrupt = true;
  await page.route('**/api/documents?action=part', async route => {
    if (route.request().method() === 'POST' && route.request().postDataJSON().part === 1 && interrupt) {
      interrupt = false;
      return route.fulfill({status: 503, json: {error: 'Přerušeno'}});
    }
    return route.fallback();
  });
  await choose(page, 'Ze Souborů', {name: 'priloha.bin', mimeType: 'application/octet-stream', buffer: contents});
  await page.getByRole('button', {name: 'Uložit dokument'}).click();
  await expect(page.locator('#docFormStatus')).toHaveText('Přerušeno');
  await page.getByRole('button', {name: 'Uložit dokument'}).click();
  await page.locator('#docEntries').getByRole('button', {name: /priloha/}).click();
  await expect(page.locator('#docViewerStatus')).toContainText('po stažení originálu');
  const download = page.waitForEvent('download');
  await page.locator('#docDownload').click();
  expect(readFileSync(await (await download).path())).toEqual(contents);
});
