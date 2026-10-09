// App entry point: loads the store, draws the current screen, and routes every
// click / change / form submit to a named handler. There are no inline event
// handler attributes in the HTML: elements carry data-action / data-form instead.

import { APP_VERSION } from './version.js';
import { createLocalStorageAdapter, KEYS } from './storage.js';
import { createStore } from './store.js';
import { hasContent } from './schema.js';
import { dateKey, daysBetween, formatStamp } from './dates.js';
import { esc } from './util.js';
import { buildBackupText, backupFileName } from './backup.js';
import * as A from './actions.js';
import { renderToday } from './view-today.js';
import { renderCalendar } from './view-calendar.js';
import { renderTasks } from './view-tasks.js';
import { renderProjects } from './view-projects.js';
import { renderLists } from './view-lists.js';
import { renderData } from './view-data.js';

const TABS = [
  ['today', 'Сегодня'], ['calendar', 'Календарь'], ['tasks', 'Задачи'],
  ['projects', 'Прогресс'], ['lists', 'Списки'], ['data', 'Данные']
];
const VIEWS = { today: renderToday, calendar: renderCalendar, tasks: renderTasks, projects: renderProjects, lists: renderLists, data: renderData };

const store = createStore({ storage: createLocalStorageAdapter() });
store.load();

const ui = {
  tab: 'today',
  quick: { text: '', kind: 'none', date: '' }, // quick-add draft survives redraws
  importPreview: null,
  importError: '',
  showJson: false,
  updateReady: false,
  updating: false,
  swReg: null,
  swState: '',
  storageInfo: null,
  standalone: (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true,
  today: dateKey(new Date()),
  refocus: null
};

const $ = sel => document.querySelector(sel);
const val = (form, name) => { const el = form.elements.namedItem(name); return el ? el.value : ''; };
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ---------- drawing ----------

function backupNote() {
  if (!hasContent(store.doc)) return '';
  const last = store.lastBackupAt();
  if (!last) return 'Резервной копии с этого устройства ещё не было.';
  const days = daysBetween(dateKey(new Date(last)), ui.today);
  return days >= 7 ? `Последняя резервная копия: ${days} дн. назад.` : '';
}

function bannersHtml() {
  const st = store.status;
  let h = '';
  if (st.readOnly) {
    h += `<div class="banner error"><b>Только чтение.</b> ${esc(st.readOnlyReason)}</div>`;
  }
  if (st.saveError) {
    h += `<div class="banner error"><b>Не удалось сохранить:</b> ${esc(st.saveError)}. Последние изменения пока только в памяти — сохраните копию.
      <div class="line"><button type="button" data-action="save.retry">Повторить</button><button type="button" data-action="backup.export">Сохранить копию</button></div></div>`;
  }
  if (ui.updateReady) {
    h += `<div class="banner info line"><span class="grow">Доступна новая версия приложения.</span><button type="button" data-action="update.apply">Обновить</button></div>`;
  }
  if (isIOS && !ui.standalone && !ui.hideSafariHint) {
    h += `<div class="banner warn line"><span class="grow">Открыто в Safari. У Safari и значка на экране «Домой» раздельные данные — установите приложение и пользуйтесь только значком.</span><button type="button" class="icon" data-action="safari.hide" aria-label="Скрыть">×</button></div>`;
  }
  for (const n of st.notices) {
    h += `<div class="banner ${n.level} line"><span class="grow">${esc(n.text)}</span><button type="button" class="icon" data-action="notice.dismiss" data-id="${esc(n.id)}" aria-label="Скрыть">×</button></div>`;
  }
  return h;
}

function statusText() {
  const st = store.status;
  if (st.readOnly) return 'Только чтение';
  if (st.saveError) return '⚠ Не сохранено';
  if (st.lastSavedAt) return 'Сохранено ' + formatStamp(st.lastSavedAt).split(', ').pop();
  return `Версия ${APP_VERSION} · данные только на этом устройстве`;
}

function render() {
  ui.today = dateKey(new Date());
  $('#nav').innerHTML = TABS.map(([k, label]) =>
    `<button type="button" class="${ui.tab === k ? 'active' : ''}" data-action="tab" data-tab="${k}"${ui.tab === k ? ' aria-current="page"' : ''}>${label}</button>`).join('');
  $('#status').textContent = statusText();
  $('#status').className = 'muted small' + (store.status.saveError || store.status.readOnly ? ' bad' : '');
  $('#banners').innerHTML = bannersHtml();
  let html;
  try {
    html = VIEWS[ui.tab](store.doc, {
      today: ui.today,
      quick: ui.quick,
      backupNote: backupNote(),
      store, ui,
      backupText: () => buildBackupText(store.doc, new Date().toISOString())
    });
  } catch (e) {
    console.error(e);
    html = `<section class="card"><h2>Ошибка отображения</h2><p class="bad">${esc(e && e.message)}</p>
      <p>Данные не потеряны. Сохраните копию и сообщите об ошибке.</p>
      <button type="button" data-action="backup.export">Сохранить копию</button></section>`;
  }
  $('#main').innerHTML = html;
  if (ui.refocus) {
    const f = document.querySelector(ui.refocus);
    const input = f && f.querySelector('input[name="title"], textarea[name="text"]');
    if (input) input.focus();
    ui.refocus = null;
  }
}

store.subscribe(render);

// ---------- files: backup export and downloads ----------

// Share sheet first (on iPhone: "Save to Files"), then a normal download.
async function saveTextFile(text, name) {
  const type = 'application/json';
  let file = null;
  try { file = new File([text], name, { type }); } catch { file = null; }
  if (file && navigator.canShare && navigator.share) {
    let can = false;
    try { can = navigator.canShare({ files: [file] }); } catch { can = false; }
    if (can) {
      try { await navigator.share({ files: [file], title: name }); return 'shared'; } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
      }
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}

async function exportBackup() {
  const now = new Date();
  const result = await saveTextFile(buildBackupText(store.doc, now.toISOString()), backupFileName(now));
  if (result !== 'cancelled') store.markBackupDone();
}

async function copyBackupText() {
  const text = buildBackupText(store.doc, new Date().toISOString());
  try {
    await navigator.clipboard.writeText(text);
    store.notify('info', 'Текст копии скопирован. Вставьте его, например, в Заметки.');
    store.markBackupDone();
  } catch {
    const ta = document.querySelector('textarea.json');
    if (ta) { ta.focus(); ta.select(); }
    store.notify('warn', 'Не удалось скопировать автоматически: текст выделен, скопируйте его вручную.');
  }
}

const stampName = at => String(at).replace(/[:.]/g, '-');

// ---------- import / restore ----------

function previewImportText(text) {
  const p = store.previewImport(text);
  ui.importPreview = p.ok ? p : null;
  ui.importError = p.ok ? '' : p.error;
  render();
}

async function importFile(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  let text;
  try { text = await file.text(); } catch (e) { ui.importError = 'Не удалось прочитать файл: ' + e.message; render(); return; }
  previewImportText(text);
}

function applyImport() {
  if (!ui.importPreview) return;
  if (!confirm('Заменить все текущие данные данными из копии?')) return;
  let res = store.applyImport(ui.importPreview);
  if (res.needForce) {
    if (!confirm('Не удалось сделать автокопию текущих данных (мало места). Если вы не сохранили копию сами, текущие данные пропадут. Всё равно заменить?')) return;
    res = store.applyImport(ui.importPreview, { force: true });
  }
  if (res.ok) { ui.importPreview = null; ui.importError = ''; }
  else if (res.error) ui.importError = res.error;
  render();
}

function restoreSnapshot(id) {
  if (!confirm('Восстановить данные из этой автокопии? Текущее состояние тоже будет сохранено в автокопиях.')) return;
  let res = store.restoreSnapshot(id);
  if (res.needForce) {
    if (!confirm('Не удалось сохранить текущее состояние (мало места). Всё равно восстановить?')) return;
    res = store.restoreSnapshot(id, { force: true });
  }
  if (!res.ok && res.error && !res.noticed) store.notify('error', 'Не удалось восстановить: ' + res.error);
}

const confirmDelete = () => confirm('Удалить? Восстановить можно во вкладке «Данные» в течение 30 дней.');

// ---------- event routing ----------

const CLICK = {
  tab: el => { ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  'task.move': el => A.moveTask(store, el.dataset.id, el.dataset.kind),
  'task.delete': el => confirmDelete() && A.softDelete(store, 'tasks', el.dataset.id),
  'event.delete': el => confirmDelete() && A.softDelete(store, 'events', el.dataset.id),
  'project.delete': el => confirmDelete() && A.softDelete(store, 'projects', el.dataset.id),
  'list.delete': el => confirmDelete() && A.softDelete(store, 'lists', el.dataset.id),
  'qty.step': el => A.stepQuantity(store, el.dataset.id, Number(el.dataset.delta)),
  restore: el => A.restoreDeleted(store, el.dataset.collection, el.dataset.id),
  'notice.dismiss': el => store.dismissNotice(el.dataset.id),
  'save.retry': () => store.retrySave(),
  'backup.export': () => exportBackup(),
  'backup.toggleText': () => { ui.showJson = !ui.showJson; render(); },
  'backup.copy': () => copyBackupText(),
  'import.apply': () => applyImport(),
  'import.cancel': () => { ui.importPreview = null; ui.importError = ''; render(); },
  'snapshot.restore': el => restoreSnapshot(el.dataset.id),
  'snapshot.download': el => { const t = store.snapshotText(el.dataset.id); if (t) saveTextFile(t, `organizer-autocopy-${stampName(el.dataset.at)}.json`); },
  'rescue.download': el => { const r = store.rescueList()[Number(el.dataset.index)]; if (r) saveTextFile(String(r.raw), `organizer-damaged-${stampName(r.at)}.txt`); },
  'quarantine.download': () => saveTextFile(JSON.stringify(store.doc.quarantine, null, 2), `organizer-quarantine-${dateKey(new Date())}.json`),
  'blocked.download': () => { if (store.status.blockedRaw) saveTextFile(store.status.blockedRaw, `organizer-raw-${dateKey(new Date())}.txt`); },
  'update.apply': () => applyUpdate(),
  'safari.hide': () => { ui.hideSafariHint = true; render(); }
};

const CHANGE = {
  'task.toggle': el => A.setTaskDone(store, el.dataset.id, el.checked),
  'milestone.toggle': el => A.setMilestoneDone(store, el.dataset.project, el.dataset.id, el.checked),
  'item.toggle': el => A.setListItemDone(store, el.dataset.list, el.dataset.id, el.checked),
  'qty.set': el => A.setQuantity(store, el.dataset.id, el.value),
  'quick.kind': el => { const d = el.form.elements.namedItem('date'); if (d) d.hidden = el.value === 'none'; },
  'import.file': el => importFile(el)
};

const FORMS = {
  'task.quickAdd': f => {
    const n = A.addTasksFromText(store, val(f, 'text'), val(f, 'kind'), val(f, 'date'));
    if (n) { ui.quick.text = ''; ui.refocus = 'form[data-form="task.quickAdd"]'; render(); }
  },
  'event.add': f => A.addEvent(store, { title: val(f, 'title'), start: val(f, 'start') }),
  'project.add': f => A.addProject(store, { name: val(f, 'name'), total: val(f, 'total'), unit: val(f, 'unit') }),
  'milestone.add': f => {
    ui.refocus = `form[data-form="milestone.add"][data-project="${CSS.escape(f.dataset.project)}"]`;
    A.addMilestone(store, f.dataset.project, val(f, 'title'));
  },
  'list.add': f => A.addList(store, val(f, 'name')),
  'item.add': f => {
    ui.refocus = `form[data-form="item.add"][data-list="${CSS.escape(f.dataset.list)}"]`;
    A.addListItem(store, f.dataset.list, val(f, 'title'));
  },
  'import.paste': f => previewImportText(val(f, 'text'))
};

function run(fn, el, label) {
  try {
    const r = fn(el);
    if (r && typeof r.catch === 'function') r.catch(e => store.notify('error', `${label}: ${e.message}`));
  } catch (e) {
    console.error(e);
    store.notify('error', `${label}: ${e.message}`);
  }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  if (el.matches('input, select, textarea')) return; // these act on "change"
  const fn = CLICK[el.dataset.action];
  if (fn) { e.preventDefault(); run(fn, el, 'Ошибка'); }
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = CHANGE[el.dataset.action];
  if (fn) run(fn, el, 'Ошибка');
});

document.addEventListener('submit', e => {
  const f = e.target;
  e.preventDefault();
  const fn = FORMS[f.dataset.form];
  if (fn) run(fn, f, 'Ошибка');
});

// Remember the quick-add draft as it is typed or picked, so redraws never lose it.
function rememberQuickDraft(e) {
  const f = e.target.form;
  if (f && f.dataset.form === 'task.quickAdd' && e.target.name in ui.quick) ui.quick[e.target.name] = e.target.value;
}
document.addEventListener('input', rememberQuickDraft);
document.addEventListener('change', rememberQuickDraft);

// ---------- keeping "today" current, other windows ----------

function checkDayChange() {
  if (dateKey(new Date()) !== ui.today) render();
}
setInterval(checkDayChange, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkDayChange();
    if (ui.swReg) ui.swReg.update().catch(() => {});
  }
});

// Another tab/window of the app saved data: reload it instead of overwriting it later.
window.addEventListener('storage', e => {
  if (e.key === KEYS.data && store.reload()) {
    store.notify('info', 'Данные изменены в другом окне — показаны актуальные.');
  }
});

// ---------- installed app: offline cache and updates ----------

function applyUpdate() {
  const w = ui.swReg && ui.swReg.waiting;
  ui.updating = true;
  if (w) w.postMessage('skip-waiting'); else location.reload();
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) { ui.swState = 'недоступен (откройте по https-адресу)'; return; }
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    ui.swReg = reg;
    const check = () => {
      ui.swState = reg.active ? 'готов, приложение работает без интернета' : 'устанавливается…';
      if (reg.waiting && navigator.serviceWorker.controller) ui.updateReady = true;
      render();
    };
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', check);
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (ui.updating) location.reload(); // only after the user pressed "Обновить"
    });
    await navigator.serviceWorker.ready;
    check();
  } catch (e) {
    ui.swState = 'ошибка: ' + e.message;
  }
}

async function refreshStorageInfo() {
  const info = { persisted: null, usage: null, quota: null };
  const s = navigator.storage;
  try {
    if (s && s.persisted) info.persisted = await s.persisted();
    if (s && s.persist && info.persisted === false) info.persisted = await s.persist();
  } catch { /* unsupported */ }
  try {
    if (s && s.estimate) { const e = await s.estimate(); info.usage = e.usage; info.quota = e.quota; }
  } catch { /* unsupported */ }
  ui.storageInfo = info;
  if (ui.tab === 'data') render();
}

// ---------- start ----------
render();
window.__organizerReady = true;
registerServiceWorker();
refreshStorageInfo();
