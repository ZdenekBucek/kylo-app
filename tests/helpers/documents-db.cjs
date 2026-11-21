'use strict';
const {PGlite} = require('@electric-sql/pglite');
const {randomUUID, randomBytes, createHash} = require('node:crypto');
const {join} = require('node:path');
const {readFileSync} = require('node:fs');
const handle = require('../../lib/documents');

exports.documentsDb = async function () {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE app_users (id uuid PRIMARY KEY, role text, is_active boolean);
    CREATE TABLE user_sessions (user_id uuid REFERENCES app_users, token_hash text, expires_at timestamptz);
  `);
  await pg.exec(readFileSync(join(__dirname, '../../migrations/20261121_documents.sql'), 'utf8'));
  const cookies = [];
  for (let i = 0; i < 2; i++) {
    const user = randomUUID();
    const token = randomBytes(32).toString('hex');
    await pg.query("INSERT INTO app_users VALUES ($1, 'user', true)", [user]);
    await pg.query("INSERT INTO user_sessions VALUES ($1,$2,now()+interval '1 hour')", [user, createHash('sha256').update(token).digest('hex')]);
    cookies.push('kylo_session=' + token);
  }
  const db = {query: async (sql, args) => (await pg.query(sql, args)).rows};
  async function call(action, {body, params = {}, headers = {}, cookie = cookies[0]} = {}) {
    const req = {method: body ? 'POST' : 'GET', body, query: {action, ...params},
      headers: {host: 'kylo.test', 'content-type': 'application/json', cookie, ...headers}};
    const res = {code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; return this; },
      status(n) { this.code = n; return this; }, json(x) { this.body = x; }, send(x) { this.body = x; }};
    await handle(req, res, db);
    return res;
  }
  return {call, cookies, close: () => pg.close()};
};
