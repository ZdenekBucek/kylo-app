'use strict';
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {documentsDb} = require('./helpers/documents-db.cjs');
let db;
before(async () => { db = await documentsDb(); });
after(async () => { await db?.close(); });

test('authentication is required for listing, reading file bytes and writing', async () => {
  for (const [action, body] of [['list'], ['part'], ['folder', {id: randomUUID(), name: 'Složka'}]]) {
    assert.equal((await db.call(action, {body, cookie: ''})).code, 401);
  }
  assert.equal((await db.call('start', {body: {}, headers: {origin: 'https://other.test'}})).code, 403);
  assert.equal((await db.call('start', {body: {}, headers: {'content-type': 'text/plain'}})).code, 415);
});

test('folders can nest, repeat names in different branches and retry creation', async () => {
  const folder = randomUUID(), sub = randomUUID();
  const make = (id, name, parent) => db.call('folder', {body: {id, name, folder: parent}});
  assert.equal((await make(folder, 'Veterina')).code, 201);
  assert.equal((await make(folder, 'Veterina')).code, 201);
  assert.equal((await make(randomUUID(), 'VETERINA')).code, 409);
  assert.equal((await make(sub, 'Veterina', folder)).code, 201);
  const all = (await db.call('list', {params: {folder}})).body.folders;
  assert.equal(all.find(item => item.id === sub).parent_id, folder);
  assert.equal((await make(randomUUID(), 'Chybí', randomUUID())).code, 404);
  const cycle = randomUUID();
  assert.equal((await make(cycle, 'Smyčka', cycle)).code, 400);
});

test('multipart upload stays private until complete, retries and reads exact original bytes', async () => {
  const root = await db.call('list');
  const n = root.body.partBytes;
  const id = randomUUID(), first = Buffer.alloc(n, 45), last = Buffer.from([0, 255, 17]);
  const metadata = {id, name: 'Výsledek', description: 'Listopad', originalName: 'vysledek.pdf', size: n + last.length};
  const post = (action, body, cookie) => db.call(action, {body: {id, ...body}, cookie});
  const part = (i, bytes, cookie) => post('part', {part: i, data: bytes.toString('base64')}, cookie);
  assert.equal((await post('start', metadata)).code, 200);
  assert.equal((await part(0, last)).code, 409);
  assert.equal((await part(2, last)).code, 409);
  assert.equal((await part(1, last, db.cookies[1])).code, 409);
  assert.equal((await part(1, last)).code, 200);
  assert.equal((await post('finish', {})).code, 409);
  assert.equal((await db.call('part', {params: {id, part: '1'}})).code, 404);
  assert.equal((await db.call('list')).body.files.some(f => f.id === id), false);
  assert.deepEqual((await post('start', metadata)).body.parts, [1]);
  assert.equal((await part(1, last)).code, 200);
  assert.equal((await part(0, first)).code, 200);
  assert.equal((await post('finish', {}, db.cookies[1])).code, 409);
  assert.equal((await post('finish', {})).code, 200);
  assert.equal((await post('finish', {})).code, 200);
  assert.equal((await post('start', metadata)).body.ready, true);
  assert.equal((await part(0, first)).code, 409);
  const list = await db.call('list', {cookie: db.cookies[1]});
  assert.equal(list.body.files.filter(f => f.id === id).length, 1);
  assert.equal(list.body.files.find(f => f.id === id).description, 'Listopad');
  for (const [i, expected] of [first, last].entries()) {
    const result = await db.call('part', {params: {id, part: String(i)}, cookie: db.cookies[1]});
    assert.deepEqual(result.body, expected);
    assert.equal(result.headers['Content-Type'], 'application/octet-stream');
    assert.match(result.headers['Cache-Control'], /no-store/);
  }
});

test('invalid file metadata and malformed chunks are rejected', async () => {
  const id = randomUUID(), input = {id, name: 'Dokument', description: '', originalName: 'soubor', size: 12};
  for (const override of [{size: 0}, {size: 26214401}, {name: ' '}, {originalName: '../x'}, {description: 'x'.repeat(2001)}]) {
    assert.equal((await db.call('start', {body: {...input, ...override}})).code, 400);
  }
  assert.equal((await db.call('part', {body: {id, part: 0, data: '!!!'}})).code, 400);
});
