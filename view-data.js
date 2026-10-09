// "Данные" screen: save status, backup, import, automatic copies, deleted
// records, quarantine, rescued raw data and storage information.

import { esc } from './util.js';
import { formatStamp } from './dates.js';
import { SCHEMA_VERSION } from './schema.js';
import { APP_VERSION } from './version.js';
import { deletedRecords } from './selectors.js';
import { empty } from './components.js';

const REASONS = {
  daily: 'ежедневная',
  'before-import': 'перед импортом',
  'before-restore': 'перед восстановлением',
  manual: 'вручную'
};

const counts = c => c ? `задач ${c.tasks}, событий ${c.events}, проектов ${c.projects}, списков ${c.lists}` : 'не читается';

const kb = bytes => bytes == null ? '—' : bytes < 1024 ? `${bytes} Б` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} КБ` : `${(bytes / 1048576).toFixed(1)} МБ`;

function importSection(ui) {
  let preview = '';
  if (ui.importError) preview = `<div class="banner error">${esc(ui.importError)}</div>`;
  if (ui.importPreview) {
    const p = ui.importPreview;
    preview += `
      <div class="banner info">
        <p><b>Файл проверен.</b> ${p.meta.exportedAt ? `Копия от ${esc(formatStamp(p.meta.exportedAt))}. ` : ''}В нём: ${esc(counts(p.counts))}.
        ${p.quarantined ? `<br>${p.quarantined} запис(ь/и) не прошли проверку и попадут в карантин (не потеряются).` : ''}</p>
        <p>Текущие данные будут <b>заменены</b>. Перед заменой сохраняется автокопия текущего состояния.</p>
        <div class="line">
          <button type="button" class="danger" data-action="import.apply">Заменить данные</button>
          <button type="button" data-action="import.cancel">Отмена</button>
        </div>
      </div>`;
  }
  return `
    <section class="card">
      <h2>Восстановить из копии</h2>
      <label class="filebtn">Выбрать файл копии…
        <input type="file" accept=".json,application/json,text/plain" data-action="import.file">
      </label>
      <details>
        <summary>Или вставить текст копии</summary>
        <form data-form="import.paste">
          <textarea name="text" rows="4" placeholder="Вставьте сюда текст резервной копии"></textarea>
          <button type="submit">Проверить</button>
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

  let h = `
    <section class="card">
      <h2>Сохранение</h2>
      ${st.readOnly ? `<p class="bad">Только чтение: ${esc(st.readOnlyReason)}</p>` : ''}
      ${st.blockedRaw ? `<button type="button" data-action="blocked.download">Скачать исходные данные</button>` : ''}
      ${st.saveError ? `<p class="bad">Последнее сохранение не удалось: ${esc(st.saveError)}.</p><button type="button" data-action="save.retry">Повторить сохранение</button>` : ''}
      <p class="muted">${st.lastSavedAt ? `Последнее сохранение: ${esc(formatStamp(st.lastSavedAt))}` : 'В этом сеансе изменений ещё не было.'}</p>
    </section>

    <section class="card">
      <h2>Резервная копия</h2>
      <p>Данные хранятся только на этом устройстве. Сохраняй копию в «Файлы» / iCloud Drive хотя бы раз в неделю.</p>
      <p class="muted">${last ? `Последняя копия: ${esc(formatStamp(last))}` : 'Копий с этого устройства ещё не было.'}</p>
      <div class="line">
        <button type="button" class="primary" data-action="backup.export">Сохранить копию</button>
        <button type="button" data-action="backup.toggleText">${ui.showJson ? 'Скрыть текст копии' : 'Показать текст копии'}</button>
      </div>
      ${ui.showJson ? `
        <p class="muted small">Запасной способ: скопируйте текст и вставьте, например, в Заметки.</p>
        <textarea class="json" readonly rows="8">${esc(backupText())}</textarea>
        <button type="button" data-action="backup.copy">Скопировать текст</button>` : ''}
    </section>

    ${importSection(ui)}

    <section class="card">
      <h2>Автокопии</h2>
      <p class="muted small">Создаются автоматически раз в день и перед импортом или восстановлением. Хранятся на этом же устройстве (до 10 штук), поэтому не заменяют экспорт.</p>
      ${snaps.length ? snaps.map(s => `
        <div class="row">
          <div class="grow">${esc(formatStamp(s.at))} · ${esc(REASONS[s.reason] || s.reason)}<div class="muted small">${esc(counts(s.counts))}</div>
            <div class="moves">
              <button type="button" data-action="snapshot.restore" data-id="${esc(s.id)}"${s.ok ? '' : ' disabled'}>Восстановить</button>
              <button type="button" data-action="snapshot.download" data-id="${esc(s.id)}" data-at="${esc(s.at)}">Скачать</button>
            </div>
          </div>
        </div>`).join('') : empty('Автокопий пока нет')}
    </section>

    <section class="card">
      <h2>Удалённые (30 дней)</h2>
      ${deleted.length ? deleted.map(r => `
        <div class="row">
          <div class="grow">${esc(r.kind)}: ${esc(r.label)}<div class="muted small">удалено ${esc(formatStamp(r.deletedAt))}</div></div>
          <button type="button" data-action="restore" data-collection="${esc(r.collection)}" data-id="${esc(r.id)}">Восстановить</button>
        </div>`).join('') : empty('Ничего не удалено')}
    </section>`;

  if (doc.quarantine.length) {
    h += `
    <section class="card">
      <h2>Карантин · ${doc.quarantine.length}</h2>
      <p class="muted small">Записи, которые не прошли проверку при загрузке или импорте. Они не показываются, но сохраняются и попадают в каждую резервную копию.</p>
      ${doc.quarantine.slice(0, 20).map(q => `<div class="row"><div class="grow small">${esc(q.collection || '?')}: ${esc(q.reason || '')}<div class="muted small">${esc(q.at ? formatStamp(q.at) : '')}</div></div></div>`).join('')}
      <button type="button" data-action="quarantine.download">Скачать карантин</button>
    </section>`;
  }

  if (rescue.length) {
    h += `
    <section class="card">
      <h2>Повреждённые данные</h2>
      <p class="muted small">Исходный текст, который не удалось прочитать. Сохранён как есть, чтобы его можно было восстановить вручную.</p>
      ${rescue.map((r, i) => `
        <div class="row">
          <div class="grow">${esc(formatStamp(r.at))} · ${esc(r.reason)}<div class="muted small">${esc(kb(String(r.raw || '').length))}</div></div>
          <button type="button" data-action="rescue.download" data-index="${i}">Скачать</button>
        </div>`).join('')}
    </section>`;
  }

  h += `
    <section class="card">
      <h2>О приложении</h2>
      <p class="muted small">
        Версия ${esc(APP_VERSION)} · схема данных ${SCHEMA_VERSION}<br>
        Запущено с экрана «Домой»: ${ui.standalone ? 'да' : 'нет'}<br>
        Офлайн-режим: ${esc(ui.swState || 'не активен')}<br>
        Постоянное хранилище: ${info.persisted === true ? 'разрешено' : info.persisted === false ? 'не разрешено браузером' : 'неизвестно'}<br>
        Занято: ${esc(kb(info.usage))}${info.quota ? ` из ${esc(kb(info.quota))}` : ''}
      </p>
    </section>`;
  return h;
}
