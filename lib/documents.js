'use strict';
const activeSession = require('./active-session');
const {uuid} = require('./planning');

const PART_BYTES = 768 * 1024;
const MAX_BYTES = 25 * 1024 * 1024;
const textValue = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !value.includes('\0');
const indexValue = n => Number.isInteger(n) && n >= 0 && n < Math.ceil(MAX_BYTES / PART_BYTES);

module.exports = async function documents(req, res, db) {
  const error = (status, message) => res.status(status).json({error: message});
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const {action} = req.query;
    const b = req.body || {};
    if (req.method !== 'GET' && req.method !== 'POST') return error(405, 'Nepodporovaná metoda.');
    if (req.method === 'POST') {
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) return error(403, 'Nepovolený původ.');
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return error(415, 'Požadován JSON.');
      const limit = action === 'part' ? 4 * PART_BYTES / 3 + 1024 : 16384;
      if (Number(req.headers['content-length']) > limit || Buffer.byteLength(JSON.stringify(b)) > limit) return error(413, 'Příliš velký požadavek.');
    }
    const user = await activeSession(db, req);
    if (!user) return error(401, 'Pro přístup k dokumentům se přihlas.');

    if (req.method === 'GET' && action === 'list') {
      const folder = req.query.folder ?? null;
      if (folder !== null && !uuid(folder)) return error(400, 'Neplatná složka.');
      const [folders, files] = await Promise.all([
        db.query('SELECT id,parent_id,name FROM document_folders ORDER BY lower(name),id'),
        db.query('SELECT id,name,description,original_name,size_bytes FROM documents WHERE ready AND folder_id IS NOT DISTINCT FROM $1::uuid ORDER BY lower(name),id', [folder])
      ]);
      if (folder && !folders.some(item => item.id === folder)) return error(404, 'Složka nebyla nalezena.');
      return res.status(200).json({folders, files, partBytes: PART_BYTES, maxBytes: MAX_BYTES});
    }
    if (req.method === 'GET' && action === 'part') {
      const {id, part} = req.query;
      if (!uuid(id) || !/^\d{1,2}$/.test(part) || !indexValue(Number(part))) return error(400, 'Neplatná část souboru.');
      const [chunk] = await db.query(`SELECT encode(c.data,'base64') AS data FROM document_chunks c
        JOIN documents d ON d.id=c.document_id WHERE d.ready AND d.id=$1 AND c.part=$2`, [id, Number(part)]);
      if (!chunk) return error(404, 'Soubor nebyl nalezen.');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment');
      return res.status(200).send(Buffer.from(chunk.data, 'base64'));
    }
    if (req.method !== 'POST') return error(404, 'Nenalezeno.');
    if (!uuid(b.id)) return error(400, 'Neplatné ID.');
    if (action === 'edit' || action === 'delete') {
      if (!['folder','file'].includes(b.kind)) return error(400, 'Neplatný typ položky.');
      const isFolder = b.kind === 'folder';
      let rows;
      if (action === 'edit') {
        if (!textValue(b.name, 160)) return error(400, 'Vyplň název do 160 znaků.');
        if (isFolder) {
          rows = await db.query('UPDATE document_folders SET name=$2 WHERE id=$1 RETURNING id', [b.id, b.name.trim()]);
        } else {
          if (typeof b.description !== 'string' || b.description.length > 2000 || b.description.includes('\0')) return error(400, 'Zkontroluj popisek.');
          rows = await db.query('UPDATE documents SET name=$2, description=$3 WHERE id=$1 AND ready RETURNING id', [b.id, b.name.trim(), b.description.trim()]);
        }
      } else if (isFolder) {
        // Foreign keys also protect against a concurrent upload or subfolder creation.
        try {
          rows = await db.query('DELETE FROM document_folders WHERE id=$1 RETURNING id', [b.id]);
        } catch (e) {
          if (e.code === '23503') return error(409, 'Složka není prázdná. Smazat lze pouze prázdnou složku.');
          throw e;
        }
      } else {
        rows = await db.query('DELETE FROM documents WHERE id=$1 AND ready RETURNING id', [b.id]);
      }
      if (!rows.length) return error(404, 'Položka už není dostupná.');
      return res.status(200).json(rows[0]);
    }
    if (action === 'folder' || action === 'start') {
      if (!textValue(b.name, 160) || (b.folder != null && !uuid(b.folder))) return error(400, 'Zkontroluj název a složku.');
      const folder = b.folder ?? null;
      if (action === 'folder') {
        if (folder?.toLowerCase() === b.id.toLowerCase()) return error(400, 'Složka nemůže být uvnitř sebe samé.');
        const [row] = await db.query(`INSERT INTO document_folders(id,parent_id,name) VALUES ($1,$2,$3)
          ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name WHERE document_folders.parent_id IS NOT DISTINCT FROM EXCLUDED.parent_id
          AND document_folders.name=EXCLUDED.name RETURNING id`, [b.id, folder, b.name.trim()]);
        if (!row) return error(409, 'Složku se nepodařilo vytvořit.');
        return res.status(201).json(row);
      }
      if (!textValue(b.originalName, 255) || /[\\/\u0000-\u001f\u007f]/.test(b.originalName) || typeof b.description !== 'string' || b.description.length > 2000 || b.description.includes('\0')) return error(400, 'Zkontroluj název souboru a popisek.');
      if (!Number.isInteger(b.size) || b.size < 1 || b.size > MAX_BYTES) return error(400, 'Vyber neprázdný soubor do 25 MB.');
      await db.query("DELETE FROM documents WHERE NOT ready AND created_at < now() - interval '1 day'");
      const [upload] = await db.query(`INSERT INTO documents(id,folder_id,name,description,original_name,size_bytes,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET
          name=CASE WHEN documents.ready THEN documents.name ELSE EXCLUDED.name END,
          description=CASE WHEN documents.ready THEN documents.description ELSE EXCLUDED.description END
        WHERE documents.created_by=EXCLUDED.created_by AND documents.folder_id IS NOT DISTINCT FROM EXCLUDED.folder_id
          AND documents.original_name=EXCLUDED.original_name AND documents.size_bytes=EXCLUDED.size_bytes
        RETURNING ready`, [b.id, folder, b.name.trim(), b.description.trim(), b.originalName, b.size, user.id]);
      if (!upload) return error(409, 'Rozpracované nahrávání neodpovídá souboru.');
      const parts = await db.query('SELECT part FROM document_chunks WHERE document_id=$1 ORDER BY part', [b.id]);
      return res.status(200).json({ready: upload.ready, parts: parts.map(row => row.part)});
    }
    if (action === 'part') {
      if (!indexValue(b.part) || typeof b.data !== 'string' || !b.data.length || b.data.length > 4 * PART_BYTES / 3 || b.data.length % 4 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(b.data)) return error(400, 'Neplatná část souboru.');
      const size = Buffer.from(b.data, 'base64').length;
      const [accepted] = await db.query(`WITH target AS (
        SELECT id FROM documents WHERE id=$1 AND created_by=$2 AND NOT ready
          AND $4::integer=LEAST($5::integer,size_bytes-$3::integer*$5) AND $4>0 FOR SHARE
      ) INSERT INTO document_chunks(document_id,part,data) SELECT id,$3,decode($6,'base64') FROM target
        ON CONFLICT(document_id,part) DO UPDATE SET part=EXCLUDED.part
        WHERE document_chunks.data=EXCLUDED.data RETURNING document_id`, [b.id, user.id, b.part, size, PART_BYTES, b.data]);
      if (!accepted) return error(409, 'Část neodpovídá rozpracovanému souboru.');
      return res.status(200).json({ok: true});
    }
    if (action === 'finish') {
      const [file] = await db.query(`UPDATE documents d SET ready=true WHERE id=$1 AND created_by=$2
        AND (ready OR (SELECT count(*) FROM document_chunks WHERE document_id=d.id)=(size_bytes+$3::integer-1)/$3)
        RETURNING id`, [b.id, user.id, PART_BYTES]);
      if (!file) return error(409, 'Soubor ještě není kompletní. Zkus uložení znovu.');
      return res.status(200).json(file);
    }
    return error(404, 'Nenalezeno.');
  } catch (e) {
    if (e.code === '23505') return error(409, 'Složka s tímto názvem už zde existuje.');
    if (e.code === '23503') return error(404, 'Složka nebyla nalezena.');
    console.error('Documents API', e.code || e.name);
    return error(500, 'Dokumenty se nepodařilo načíst nebo uložit.');
  }
};
