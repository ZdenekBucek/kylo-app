'use strict';
(() => {
  const editor = $('docEditor');
  const viewer = $('docViewer');
  const actions = $('docActions');
  let sourceButton, sourceNav, folder, listing, draft, preview;
  let listRequest = 0;
  const sizeLabel = bytes => bytes < 1024 * 1024
    ? Math.max(1, Math.round(bytes / 1024)) + ' kB'
    : (bytes / (1024 * 1024)).toLocaleString('cs-CZ', {maximumFractionDigits: 1}) + ' MB';

  async function request(action, {body, params = {}, signal} = {}) {
    const response = await fetch('/api/documents?' + new URLSearchParams({action, ...params}), {
      method: body ? 'POST' : 'GET', credentials: 'same-origin', signal,
      headers: body ? {'Content-Type': 'application/json'} : {},
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Požadavek se nezdařil. Zkus to znovu.');
    }
    return response;
  }
  async function save(action, body) {
    return (await request(action, {body})).json();
  }

  function drawListing() {
    const byId = new Map(listing.folders.map(item => [item.id, item]));
    const crumbs = [];
    for (let item = byId.get(folder); item; item = byId.get(item.parent_id)) crumbs.unshift(item);
    const path = $('docPath');
    path.hidden = !crumbs.length;
    path.innerHTML = [{id: '', name: 'Dokumenty'}, ...crumbs].map((item, index) =>
      index === crumbs.length ? '<span aria-current="page">' + esc(item.name) + '</span>'
        : '<button type="button" data-folder="' + esc(item.id) + '">' + esc(item.name) + '</button><span aria-hidden="true">›</span>'
    ).join('');
    const entries = [];
    const row = (icon, attr, item, sub) => '<button type="button" class="doc-entry" aria-haspopup="dialog" data-' + attr + '="' + esc(item.id) + '">'
      + '<span class="ico">' + uiIcon(icon) + '</span><span class="doc-copy"><strong>' + esc(item.name) + '</strong>'
      + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><span class="row-chevron">' + uiIcon('right') + '</span></button>';
    for (const item of listing.folders.filter(item => item.parent_id === folder)) entries.push(row('folder', 'folder', item, ''));
    for (const item of listing.files) entries.push(row('file', 'file', item, item.description || sizeLabel(item.size_bytes)));
    $('docEntries').innerHTML = entries.length ? '<div class="doc-list">' + entries.join('') + '</div>'
      : '<p class="doc-empty">Složka je zatím prázdná.</p>';
  }
  async function loadFolder(id) {
    const current = ++listRequest;
    folder = id;
    listing = null;
    $('docEntries').replaceChildren();
    $('docPath').hidden = true;
    $('docRetry').hidden = true;
    $('docStatus').textContent = 'Načítám složku…';
    const controls = [$('docNewFolder'), $('docPick'), $('docPhoto')];
    controls.forEach(button => button.disabled = true);
    try {
      const result = await (await request('list', {params: id ? {folder: id} : {}})).json();
      if (current !== listRequest) return;
      listing = result;
      drawListing();
      controls.forEach(button => button.disabled = false);
      $('docStatus').textContent = '';
    } catch (e) {
      if (current !== listRequest) return;
      $('docStatus').textContent = e.message;
      $('docRetry').hidden = false;
    }
  }

  document.querySelectorAll('[data-doc-icon]').forEach(el => el.innerHTML = uiIcon(el.dataset.docIcon));
  document.querySelectorAll('[data-documents]').forEach(button => button.onclick = () => {
    sourceButton = button;
    sourceNav = document.querySelector('.nav button.active');
    $('docReturnLabel').textContent = sourceNav.textContent.trim();
    go('documents', sourceNav);
    window.scrollTo(0, 0);
    $('docHeading').focus({preventScroll: true});
    loadFolder(null);
  });
  $('docBack').onclick = () => {
    go(sourceButton.closest('.screen').id, sourceNav);
    sourceButton.focus();
  };
  $('docRetry').onclick = () => loadFolder(folder);
  $('documents').addEventListener('click', event => {
    const entry = event.target.closest('[data-folder],[data-file]');
    if (!entry || !listing) return;
    if (entry.hasAttribute('data-folder')) return loadFolder(entry.dataset.folder || null);
    const file = listing.files.find(item => item.id === entry.dataset.file);
    if (file) openFile(file, entry);
  });

  const entries = $('docEntries');
  let selection, press, suppressClick = false;
  function showActions(entry) {
    if (!entry || !listing || actions.open) return;
    const kind = entry.dataset.folder ? 'folder' : 'file';
    const items = kind === 'folder' ? listing.folders : listing.files;
    const item = items.find(row => row.id === entry.dataset[kind]);
    if (!item) return;
    selection = {kind, item, entry};
    $('docActionsTitle').textContent = item.name;
    $('docActionStatus').textContent = '';
    uiOpenDialog(actions, entry);
  }
  function clearPress() {
    if (press) clearTimeout(press.timer);
    press = null;
  }
  document.addEventListener('pointerdown', () => { clearPress(); suppressClick = false; }, true);
  entries.addEventListener('pointerdown', e => {
    const entry = e.target.closest('.doc-entry');
    if (!entry || !e.isPrimary || e.pointerType === 'mouse' || e.button !== 0) return;
    press = {x: e.clientX, y: e.clientY, id: e.pointerId, timer: setTimeout(() => {
      if (!entry.isConnected) return;
      suppressClick = true;
      showActions(entry);
    }, 550)};
  });
  document.addEventListener('pointermove', e => {
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) clearPress();
  });
  for (const event of ['pointerup','pointercancel']) document.addEventListener(event, clearPress, true);
  window.addEventListener('blur', clearPress);
  entries.addEventListener('contextmenu', e => {
    const entry = e.target.closest('.doc-entry');
    if (!entry) return;
    e.preventDefault();
    clearPress();
    suppressClick = true;
    showActions(entry);
  });
  entries.addEventListener('keydown', e => {
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      showActions(e.target.closest('.doc-entry'));
    }
  });
  document.addEventListener('click', e => {
    if (suppressClick && e.detail !== 0) {
      suppressClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
  $('docEditItem').onclick = () => {
    uiCloseDialog(actions);
    edit(null, selection.entry, selection);
  };
  $('docDeleteItem').onclick = async () => {
    const {kind, item} = selection;
    const title = kind === 'folder' ? 'Smazat složku?' : 'Smazat soubor?';
    const message = 'Opravdu chceš smazat „' + item.name + '“?';
    if (!await askConfirmation({title, message, accept: 'Smazat', cancel: 'Zrušit', opener: $('docDeleteItem')})) return;
    uiDialogBusy(actions, true);
    let deleted = false;
    try {
      await save('delete', {id: item.id, kind});
      deleted = true;
    } catch (e) {
      $('docActionStatus').textContent = e.message;
    } finally {
      uiDialogBusy(actions, false);
    }
    if (deleted) {
      uiCloseDialog(actions);
      await loadFolder(folder);
      $('docHeading').focus({preventScroll: true});
    }
  };

  for (const dialog of [editor, viewer, actions]) {
    uiBindDialog(dialog);
    dialog.querySelector('[data-doc-close]').onclick = () => uiCloseDialog(dialog);
  }
  function edit(file, opener, existing) {
    if (!listing) return;
    if (file && (!file.size || file.size > listing.maxBytes)) {
      $('docStatus').textContent = 'Vyber neprázdný soubor do ' + sizeLabel(listing.maxBytes) + '.';
      return;
    }
    draft = {id: existing?.item.id ?? crypto.randomUUID(), folder, file, existing};
    $('docForm').reset();
    $('docFormStatus').textContent = '';
    $('docEditorTitle').textContent = file ? 'Nový dokument' : 'Nová složka';
    $('docDescLabel').hidden = !file;
    $('docSource').textContent = file ? file.name + ' · ' + sizeLabel(file.size) : '';
    $('docName').value = file ? (file.name.replace(/\.[^.]+$/, '') || file.name).slice(0, 160) : '';
    $('docSave').textContent = file ? 'Uložit dokument' : 'Vytvořit složku';
    if (existing) {
      const isFolder = existing.kind === 'folder';
      $('docEditorTitle').textContent = isFolder ? 'Editovat složku' : 'Editovat soubor';
      $('docDescLabel').hidden = isFolder;
      $('docName').value = existing.item.name;
      $('docDesc').value = existing.item.description || '';
      $('docSource').textContent = existing.item.original_name || '';
      $('docSave').textContent = 'Uložit změny';
    }
    uiOpenDialog(editor, opener);
    $('docName').focus();
  }
  $('docNewFolder').onclick = event => edit(null, event.currentTarget);
  for (const [button, input] of [[$('docPick'), $('docFile')], [$('docPhoto'), $('docCamera')]]) {
    button.onclick = () => { input.value = ''; input.click(); };
    input.onchange = () => { if (input.files[0]) edit(input.files[0], button); };
  }
  editor.addEventListener('close', () => { draft = null; $('docFile').value = ''; $('docCamera').value = ''; });

  function base64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(new Error('Soubor se nepodařilo přečíst.'));
      reader.readAsDataURL(blob);
    });
  }
  async function upload(item, name) {
    const file = item.file;
    const started = await save('start', {id: item.id, folder: item.folder, name, description: $('docDesc').value,
      originalName: file.name.replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 255), size: file.size});
    if (started.ready) return;
    const received = new Set(started.parts);
    const length = listing.partBytes;
    const count = Math.ceil(file.size / length);
    for (let part = 0; part < count; part++) {
      $('docFormStatus').textContent = 'Nahrávám soubor… ' + Math.round(part / count * 100) + ' %';
      if (!received.has(part)) {
        const data = await base64(file.slice(part * length, (part + 1) * length));
        await save('part', {id: item.id, part, data});
      }
    }
    await save('finish', {id: item.id});
  }
  $('docForm').onsubmit = async event => {
    event.preventDefault();
    if (!draft || editor.dataset.busy === '1') return;
    const name = $('docName').value.trim();
    if (!name) { $('docFormStatus').textContent = 'Vyplň název.'; return; }
    uiDialogBusy(editor, true);
    $('docFormStatus').textContent = 'Ukládám…';
    try {
      if (draft.existing) await save('edit', {kind: draft.existing.kind, id: draft.id, name, description: $('docDesc').value});
      else if (draft.file) await upload(draft, name);
      else await save('folder', {id: draft.id, folder: draft.folder, name});
    } catch (e) {
      $('docFormStatus').textContent = e.message;
      return;
    } finally {
      uiDialogBusy(editor, false);
    }
    uiCloseDialog(editor);
    await loadFolder(folder);
  };

  function stopPreview() {
    if (!preview) return;
    preview.controller.abort();
    preview.pdf?.destroy().catch(() => {});
    if (preview.url) URL.revokeObjectURL(preview.url);
    preview = null;
    $('docPreview').replaceChildren();
    $('docDownload').removeAttribute('href');
    $('docDownload').hidden = true;
  }
  viewer.addEventListener('close', stopPreview);

  async function pdfPreview(blob, current) {
    const lib = await import('/pdfjs/pdf.min.mjs');
    lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
    const data = new Uint8Array(await blob.arrayBuffer());
    if (current !== preview) return;
    const task = lib.getDocument({data, isEvalSupported: false, disableWorkerRendering: true,
      cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/',
      wasmUrl: '/pdfjs/wasm/', iccUrl: '/pdfjs/iccs/'});
    current.pdf = task;
    const pdf = await task.promise;
    if (current !== preview) return;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    const bar = document.createElement('div');
    bar.className = 'doc-pages';
    bar.innerHTML = '<button class="secondary" type="button" aria-label="Předchozí strana">‹</button>'
      + '<span role="status"></span><button class="secondary" type="button" aria-label="Další strana">›</button>';
    const [prev, next] = bar.querySelectorAll('button');
    let number = 1;
    async function draw(n) {
      prev.disabled = next.disabled = true;
      try {
        const page = await pdf.getPage(n);
        if (current !== preview) return;
        const natural = page.getViewport({scale: 1});
        const width = Math.max(1, $('docPreview').clientWidth);
        const viewport = page.getViewport({scale: Math.min(width * Math.min(devicePixelRatio, 2) / natural.width, 2200 / Math.max(natural.width, natural.height))});
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({canvas, viewport}).promise;
        if (current !== preview) return;
        number = n;
        const label = 'Strana ' + n + ' z ' + pdf.numPages;
        canvas.setAttribute('aria-label', label);
        bar.querySelector('span').textContent = label;
        $('docViewerStatus').textContent = '';
      } catch {
        if (current === preview) $('docViewerStatus').textContent = 'Stranu se nepodařilo zobrazit. Můžeš stáhnout originál.';
      } finally {
        prev.disabled = number <= 1;
        next.disabled = number >= pdf.numPages;
      }
    }
    prev.onclick = () => draw(number - 1);
    next.onclick = () => draw(number + 1);
    $('docPreview').append(canvas, bar);
    await draw(1);
  }

  async function display(blob, file, current) {
    const head = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
    if (current !== preview) return;
    const magic = String.fromCharCode(...head);
    if (magic.startsWith('%PDF-')) return pdfPreview(blob, current);
    let type;
    if (head[0] === 255 && head[1] === 216 && head[2] === 255) type = 'image/jpeg';
    else if (magic.startsWith('\x89PNG\r\n\x1a\n')) type = 'image/png';
    else if (/^GIF8[79]a/.test(magic)) type = 'image/gif';
    else if (magic.startsWith('RIFF') && magic.slice(8, 12) === 'WEBP') type = 'image/webp';
    else if (magic.slice(4, 8) === 'ftyp' && /heic|heix|hevc|mif1|avif|avis/.test(magic.slice(8))) type = /avif|avis/.test(magic) ? 'image/avif' : 'image/heic';
    if (type) {
      const img = document.createElement('img');
      img.alt = file.name;
      current.imageUrl = URL.createObjectURL(blob.slice(0, blob.size, type));
      current.controller.signal.addEventListener('abort', () => URL.revokeObjectURL(current.imageUrl), {once: true});
      img.onerror = () => { if (current === preview) { img.remove(); $('docViewerStatus').textContent = 'Zařízení tento obrázek neumí zobrazit. Stáhni si originál.'; } };
      img.src = current.imageUrl;
      $('docPreview').append(img);
      return;
    }
    if (/\.(txt|csv|md|log|json)$/i.test(file.original_name)) {
      const pre = document.createElement('pre');
      const limit = 256 * 1024;
      pre.textContent = await blob.slice(0, limit).text();
      if (current !== preview) return;
      $('docPreview').append(pre);
      if (blob.size > limit) $('docViewerStatus').textContent = 'Zobrazen je začátek souboru. Celý text je ke stažení.';
      return;
    }
    $('docViewerStatus').textContent = 'Tento formát otevřeš v odpovídající aplikaci po stažení originálu.';
  }
  async function openFile(file, opener) {
    stopPreview();
    const current = {controller: new AbortController()};
    preview = current;
    $('docViewerTitle').textContent = file.name;
    $('docViewerDesc').textContent = file.description;
    $('docViewerMeta').textContent = file.original_name + ' · ' + sizeLabel(file.size_bytes);
    $('docViewerStatus').textContent = 'Načítám soubor…';
    $('docViewerRetry').hidden = true;
    uiOpenDialog(viewer, opener);
    try {
      const chunks = [];
      const step = listing.partBytes;
      for (let i = 0; i * step < file.size_bytes; i++) {
        const response = await request('part', {params: {id: file.id, part: i}, signal: current.controller.signal});
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== Math.min(step, file.size_bytes - i * step)) throw new Error('Soubor se nenačetl celý.');
        chunks.push(bytes);
      }
      if (current !== preview) return;
      const blob = new Blob(chunks, {type: 'application/octet-stream'});
      current.url = URL.createObjectURL(blob);
      const download = $('docDownload');
      download.href = current.url;
      download.download = file.original_name;
      download.hidden = false;
      $('docViewerStatus').textContent = '';
      await display(blob, file, current);
    } catch (e) {
      if (current !== preview) return;
      $('docViewerStatus').textContent = current.url ? 'Náhled se nepodařilo otevřít. Můžeš stáhnout originál.' : e.message;
      $('docViewerRetry').hidden = false;
      $('docViewerRetry').onclick = () => openFile(file, opener);
    }
  }
})();
