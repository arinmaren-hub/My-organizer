// "Данные" screen: save status, backup, import, automatic copies, deleted
// records, quarantine, rescued raw data and storage information.

import { esc } from './util.js';
import { t, msg, has, formatStamp, sizeText, countsText } from './i18n.js';
import { SCHEMA_VERSION } from './schema.js';
import { APP_VERSION } from './version.js';
import { deletedRecords } from './selectors.js';
import { empty } from './components.js';

const counts = c => (c ? countsText(c) : t('counts.unreadable'));
// Snapshot reasons: known ones are translated, anything else is shown as stored.
const reasonText = r => (has(`snap.${r}`) ? t(`snap.${r}`) : typeof r === 'string' ? r : '');
// Quarantine entries come from data files: only plain text is shown from them.
const plain = v => (typeof v === 'string' ? v : '');

function importSection(ui) {
  let preview = '';
  if (ui.importError) preview = `<div class="banner error">${esc(msg(ui.importError))}</div>`;
  if (ui.importPreview) {
    const p = ui.importPreview;
    preview += `
      <div class="banner info">
        <p><b>${esc(t('data.checked'))}</b> ${p.meta.exportedAt ? `${esc(t('data.copyFrom', { at: { $stamp: p.meta.exportedAt } }))} ` : ''}${esc(t('data.contains', { counts: counts(p.counts) }))}
        ${p.quarantined ? `<br>${esc(t('data.willQuarantine', { n: p.quarantined }))}` : ''}</p>
        ${p.replacesData && p.origin === 'other' ? `<p class="bad"><b>${esc(t('data.originOther'))}</b></p>` : ''}
        ${p.replacesData && p.origin === 'unknown' ? `<p>${esc(t('data.originUnknown'))}</p>` : ''}
        <p>${esc(t('data.willReplace1'))} <b>${esc(t('data.willReplace2'))}</b>${esc(t('data.willReplace3'))}</p>
        <div class="line">
          <button type="button" class="danger" data-action="import.apply">${esc(t('data.replace'))}</button>
          <button type="button" data-action="import.cancel">${esc(t('btn.cancel'))}</button>
        </div>
      </div>`;
  }
  return `
    <section class="card">
      <h2>${esc(t('data.restoreTitle'))}</h2>
      <label class="filebtn">${esc(t('data.chooseFile'))}
        <input type="file" accept=".json,application/json,text/plain" data-action="import.file">
      </label>
      <details>
        <summary>${esc(t('data.pasteSummary'))}</summary>
        <form data-form="import.paste">
          <textarea name="text" rows="4" placeholder="${esc(t('data.pastePh'))}"></textarea>
          <button type="submit">${esc(t('data.check'))}</button>
        </form>
      </details>
      ${preview}
    </section>`;
}

export function renderData(doc, ctx) {
  const { store, ui, backupText } = ctx;
  const st = store.status;
  const last = store.lastBackupAt();
  const snaps = store.listSnapshots();
  const deleted = deletedRecords(doc);
  const rescue = store.rescueList();
  const info = ui.storageInfo || {};
  const persist = info.persisted === true ? 'persist.yes' : info.persisted === false ? 'persist.no' : 'persist.unknown';

  let h = `
    <section class="card">
      <h2>${esc(t('data.save'))}</h2>
      ${st.readOnly ? `<p class="bad">${esc(t('data.readOnly', { reason: st.readOnlyReason }))}</p>` : ''}
      ${st.blockedRaw ? `<div class="line"><button type="button" data-action="blocked.download">${esc(t('data.downloadRaw'))}</button>
        ${st.stopped === 'ro.upgradeNoCopy' ? `<button type="button" data-action="upgrade.continue">${esc(t('data.continueUpgrade'))}</button>` : ''}</div>` : ''}
      ${st.saveError ? `<p class="bad">${esc(t('data.saveFailed', { reason: st.saveError }))}</p><button type="button" data-action="save.retry">${esc(t('data.retrySave'))}</button>` : ''}
      <p class="muted">${esc(st.lastSavedAt ? t('data.lastSaved', { at: { $stamp: st.lastSavedAt } }) : t('data.noChanges'))}</p>
    </section>

    <section class="card">
      <h2>${esc(t('data.backup'))}</h2>
      <p>${esc(t('data.backupInfo'))}</p>
      <p class="muted">${esc(last ? t('data.lastBackup', { at: { $stamp: last } }) : t('data.noBackup'))}</p>
      <div class="line">
        <button type="button" class="primary" data-action="backup.export">${esc(t('btn.saveBackup'))}</button>
        <button type="button" data-action="backup.toggleText">${esc(t(ui.showJson ? 'data.hideText' : 'data.showText'))}</button>
      </div>
      ${ui.showJson ? `
        <p class="muted small">${esc(t('data.textHint'))}</p>
        <textarea class="json" readonly rows="8">${esc(backupText())}</textarea>
        <button type="button" data-action="backup.copy">${esc(t('data.copyText'))}</button>` : ''}
    </section>

    ${importSection(ui)}

    <section class="card">
      <h2>${esc(t('data.snapshots'))}</h2>
      <p class="muted small">${esc(t('data.snapshotsInfo'))}</p>
      ${snaps.length ? snaps.map(s => `
        <div class="row">
          <div class="grow">${esc(formatStamp(s.at))} · ${esc(reasonText(s.reason))}<div class="muted small">${esc(counts(s.counts))}</div>
            <div class="moves">
              <button type="button" data-action="snapshot.restore" data-id="${esc(s.id)}"${s.ok ? '' : ' disabled'}>${esc(t('btn.restore'))}</button>
              <button type="button" data-action="snapshot.download" data-id="${esc(s.id)}" data-at="${esc(s.at)}">${esc(t('btn.download'))}</button>
            </div>
          </div>
        </div>`).join('') : empty(t('data.noSnapshots'))}
    </section>

    <section class="card">
      <h2>${esc(t('data.deleted'))}</h2>
      ${deleted.length ? deleted.map(r => `
        <div class="row">
          <div class="grow">${esc(t(`kind.${r.collection}`))}: ${esc(r.label)}<div class="muted small">${esc(t('data.deletedAt', { at: { $stamp: r.deletedAt } }))}</div></div>
          <button type="button" data-action="restore" data-collection="${esc(r.collection)}" data-id="${esc(r.id)}">${esc(t('btn.restore'))}</button>
        </div>`).join('') : empty(t('data.nothingDeleted'))}
    </section>`;

  if (doc.quarantine.length) {
    h += `
    <section class="card">
      <h2>${esc(t('data.quarantine', { n: doc.quarantine.length }))}</h2>
      <p class="muted small">${esc(t('data.quarantineInfo'))}</p>
      ${doc.quarantine.slice(0, 20).map(q => `<div class="row"><div class="grow small">${esc(plain(q.collection) || '?')}: ${esc(t(plain(q.reason)))}<div class="muted small">${esc(plain(q.at) ? formatStamp(q.at) : '')}</div></div></div>`).join('')}
      <button type="button" data-action="quarantine.download">${esc(t('data.quarantineDownload'))}</button>
    </section>`;
  }

  if (rescue.length) {
    h += `
    <section class="card">
      <h2>${esc(t('data.damaged'))}</h2>
      <p class="muted small">${esc(t('data.damagedInfo'))}</p>
      ${rescue.map((r, i) => `
        <div class="row">
          <div class="grow">${esc(formatStamp(r.at))} · ${esc(t(plain(r.reason)))}<div class="muted small">${esc(sizeText(plain(r.raw).length))}</div></div>
          <button type="button" data-action="rescue.download" data-index="${i}">${esc(t('btn.download'))}</button>
        </div>`).join('')}
    </section>`;
  }

  h += `
    <section class="card">
      <h2>${esc(t('data.about'))}</h2>
      <p class="small">${esc(t('data.privacy', { address: ctx.address || '' }))}</p>
      <p class="muted small">
        ${esc(t('data.version', { v: APP_VERSION, s: SCHEMA_VERSION }))}<br>
        ${esc(t('data.standalone', { yn: { $t: ui.standalone ? 'yes' : 'no' } }))}<br>
        ${esc(t('data.offline', { state: ui.swState ? msg(ui.swState) : t('sw.inactive') }))}<br>
        ${esc(t('data.persist', { state: { $t: persist } }))}<br>
        ${esc(info.quota ? t('data.usedOf', { used: sizeText(info.usage), quota: sizeText(info.quota) }) : t('data.used', { used: sizeText(info.usage) }))}
      </p>
    </section>`;
  return h;
}
