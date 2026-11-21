'use strict';
const {createHash} = require('node:crypto');

module.exports = async function activeSession(db, request) {
  const token = (request.headers.cookie || '').match(/(?:^|;\s*)kylo_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return null;
  const [user] = await db.query(
    'SELECT u.id,u.role FROM user_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active=true',
    [createHash('sha256').update(token).digest('hex')]
  );
  return user;
};
