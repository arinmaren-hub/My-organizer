// App entry point: loads the store, draws the current screen, and routes every
// click / change / form submit to a named handler. There are no inline event
// handler attributes in the HTML: elements carry data-action / data-form instead.

import { APP_VERSION } from './version.js';
import { createLocalStorageAdapter, KEYS } from './storage.js';
import { createStore } from './store.js';
import { hasContent } from './schema.js';
import { dateKey, daysBetween, addDays } from './dates.js';
import { t, msg, m, setLang, getLang, readLanguage, saveLanguage, LANGS, formatStamp } from './i18n.js';
import { esc } from './util.js';
import { buildBackupText, backupFileName } from './backup.js';
import * as A from './actions.js';
import { renderToday } from './view-today.js';
import { renderCalendar } from './view-calendar.js';
import { renderTasks } from './view-tasks.js';
import { renderProjects } from './view-projects.js';
import { renderLists } from './view-lists.js';
import { renderData } from './view-data.js';
import { renderSettings } from './view-settings.js';
import { renderOnboarding } from './view-onboarding.js';
import { dayWindow, suggestCutoff } from './planday.js';
import { MODES, readAppearance, saveAppearance, applyAppearance } from './appearance.js';

const TABS = ['today', 'calendar', 'tasks', 'projects', 'lists', 'data'];
const VIEWS = { today: renderToday, calendar: renderCalendar, tasks: renderTasks, projects: renderProjects, lists: renderLists, data: renderData, settings: renderSettings };

const storage = createLocalStorageAdapter();
setLang(readLanguage(storage)); // chosen by hand; Russian by default; never detected
const store = createStore({ storage });
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
  swState: null, // a message ({ key }) shown on «Данные»
  storageInfo: null,
  standalone: (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true,
  today: null,          // the PLANNING day (planday.js), set on every redraw
  onb: { wake: '', bed: '', cutoff: '', cutoffTouched: false }, // first-launch draft
  refocus: null,
  appearance: readAppearance(storage) // 'system' | 'light' | 'dark' (already applied by boot.js)
};
applyAppearance(ui.appearance);

const $ = sel => document.querySelector(sel);
const val = (form, name) => { const el = form.elements.namedItem(name); return el ? el.value : ''; };
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ---------- drawing ----------

function backupNote() {
  if (!hasContent(store.doc)) return '';
  const last = store.lastBackupAt();
  if (!last) return t('backup.none');
  const days = daysBetween(dateKey(new Date(last)), dateKey(new Date()));
  return days >= 7 ? t('backup.daysAgo', { days }) : '';
}

function bannersHtml() {
  const st = store.status;
  let h = '';
  if (st.readOnly) {
    h += `<div class="banner error"><b>${esc(t('banner.readOnly'))}</b> ${esc(msg(st.readOnlyReason))}</div>`;
  }
  if (st.saveError) {
    h += `<div class="banner error"><b>${esc(t('banner.saveFailed'))}</b> ${esc(msg(st.saveError))}. ${esc(t('banner.saveFailedTail'))}
      <div class="line"><button type="button" data-action="save.retry">${esc(t('btn.retry'))}</button><button type="button" data-action="backup.export">${esc(t('btn.saveBackup'))}</button></div></div>`;
  }
  if (ui.updateReady) {
    h += `<div class="banner info line"><span class="grow">${esc(t('banner.update'))}</span><button type="button" data-action="update.apply">${esc(t('btn.update'))}</button></div>`;
  }
  if (isIOS && !ui.standalone && !ui.hideSafariHint) {
    h += `<div class="banner warn line"><span class="grow">${esc(t('banner.safari'))}</span><button type="button" class="icon" data-action="safari.hide" aria-label="${esc(t('btn.hide'))}">×</button></div>`;
  }
  for (const n of st.notices) {
    h += `<div class="banner ${n.level} line"><span class="grow">${esc(msg(n))}</span><button type="button" class="icon" data-action="notice.dismiss" data-id="${esc(n.id)}" aria-label="${esc(t('btn.hide'))}">×</button></div>`;
  }
  return h;
}

function statusText() {
  const st = store.status;
  if (st.readOnly) return t('status.readOnly');
  if (st.saveError) return t('status.notSaved');
  if (st.lastSavedAt) return t('status.saved', { time: formatStamp(st.lastSavedAt).split(', ').pop() });
  return t('status.idle', { v: APP_VERSION });
}

// A redraw that the user did not cause (offline cache ready, another window,
// midnight) must not interrupt typing: remember the focused field, its text and
// cursor, and put them back after the redraw. Not done while a form is being
// submitted, so a submitted field is still cleared normally.
function captureTyping() {
  const el = document.activeElement;
  if (ui.inSubmit || !el || !el.closest || !el.closest('#main') || !el.matches('input, textarea, select') || !el.name || el.type === 'file') return null;
  const f = el.form;
  if (!f || !f.dataset.form) return null;
  let sel = `form[data-form="${CSS.escape(f.dataset.form)}"]`;
  if (f.dataset.project) sel += `[data-project="${CSS.escape(f.dataset.project)}"]`;
  if (f.dataset.list) sel += `[data-list="${CSS.escape(f.dataset.list)}"]`;
  let start = null, end = null;
  try { start = el.selectionStart; end = el.selectionEnd; } catch { /* not a text field */ }
  return { sel, name: el.name, value: el.value, start, end };
}

function restoreTyping(t) {
  if (!t) return;
  const f = document.querySelector(t.sel);
  const el = f && f.elements.namedItem(t.name);
  if (!el || typeof el.focus !== 'function') return;
  if (el.value !== t.value) el.value = t.value;
  el.focus();
  try { if (t.start != null) el.setSelectionRange(t.start, t.end); } catch { /* not a text field */ }
}

// First-launch questions are shown until answered or skipped (never in read-only mode).
const needsOnboarding = () => !store.doc.settings.day.setupDone && !store.status.readOnly;

function render() {
  const typing = captureTyping();
  ui.today = store.planningToday();
  ui.calendarToday = dateKey(new Date());
  applyLanguageToPage();
  const onboarding = needsOnboarding();
  $('#nav').hidden = onboarding;
  $('#settings-btn').hidden = onboarding;
  $('#nav').innerHTML = TABS.map(k =>
    `<button type="button" class="${ui.tab === k ? 'active' : ''}" data-action="tab" data-tab="${k}"${ui.tab === k ? ' aria-current="page"' : ''}>${esc(t('tab.' + k))}</button>`).join('');
  const settingsBtn = $('#settings-btn');
  settingsBtn.classList.toggle('active', ui.tab === 'settings');
  if (ui.tab === 'settings') settingsBtn.setAttribute('aria-current', 'page'); else settingsBtn.removeAttribute('aria-current');
  $('#status').textContent = statusText();
  $('#status').className = 'muted small' + (store.status.saveError || store.status.readOnly ? ' bad' : '');
  $('#banners').innerHTML = bannersHtml();
  let html;
  try {
    const view = onboarding ? renderOnboarding : VIEWS[ui.tab];
    html = view(store.doc, {
      today: ui.today,
      calendarToday: ui.calendarToday,
      natural: store.naturalToday(),
      cutoff: store.doc.settings.day.cutoff,
      finishedEarly: store.dayFinishedEarly(),
      onb: ui.onb,
      quick: ui.quick,
      backupNote: backupNote(),
      store, ui,
      appearance: ui.appearance,
      language: getLang(),
      address: location.origin + location.pathname.replace(/[^/]*$/, ''),
      backupText: () => buildBackupText(store.doc, new Date().toISOString())
    });
  } catch (e) {
    console.error(e);
    html = `<section class="card"><h2>${esc(t('render.errorTitle'))}</h2><p class="bad">${esc(e && e.message)}</p>
      <p>${esc(t('render.errorText'))}</p>
      <button type="button" data-action="backup.export">${esc(t('btn.saveBackup'))}</button></section>`;
  }
  $('#main').innerHTML = html;
  restoreTyping(typing);
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
    store.notify('info', 'notice.copied');
    store.markBackupDone();
  } catch {
    const ta = document.querySelector('textarea.json');
    if (ta) { ta.focus(); ta.select(); }
    store.notify('warn', 'notice.copyFailed');
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
  try { text = await file.text(); } catch (e) { ui.importError = m('imp.readFailed', { msg: e.message }); render(); return; }
  previewImportText(text);
}

// Every import is confirmed; a backup from a different organizer that would
// replace existing data is confirmed a second time (SECURITY.md).
function applyImport() {
  if (!ui.importPreview) return;
  if (!confirm(t('confirm.import'))) return;
  const opts = {};
  let res = store.applyImport(ui.importPreview, opts);
  if (res.needForeignConfirm) {
    if (!confirm(t('confirm.importForeign'))) return;
    opts.foreignConfirmed = true;
    res = store.applyImport(ui.importPreview, opts);
  }
  if (res.needDropConfirm) {
    if (!confirm(t('confirm.dropRollback', { at: { $stamp: res.dropAt } }))) return;
    opts.dropConfirmed = true;
    res = store.applyImport(ui.importPreview, opts);
  }
  if (res.needForce) {
    if (!confirm(t('confirm.importForce'))) return;
    opts.force = true;
    res = store.applyImport(ui.importPreview, opts);
  }
  if (res.ok) { ui.importPreview = null; ui.importError = ''; }
  else if (res.error) ui.importError = res.error;
  render();
}

function restoreSnapshot(id) {
  if (!confirm(t('confirm.restore'))) return;
  const opts = {};
  let res = store.restoreSnapshot(id, opts);
  if (res.needDropConfirm) {
    if (!confirm(t('confirm.dropRollback', { at: { $stamp: res.dropAt } }))) return;
    opts.dropConfirmed = true;
    res = store.restoreSnapshot(id, opts);
  }
  if (res.needForce) {
    if (!confirm(t('confirm.restoreForce'))) return;
    opts.force = true;
    res = store.restoreSnapshot(id, opts);
  }
  if (!res.ok && res.error && !res.noticed) store.notify('error', 'notice.restoreFailedShort', { reason: res.error });
}

const confirmDelete = () => confirm(t('confirm.delete'));

// ---------- appearance ----------

// Changes only the look. Never touches the data document or automatic copies.
function setAppearance(mode) {
  if (!MODES.includes(mode)) return;
  applyAppearance(mode);
  ui.appearance = mode;
  if (!saveAppearance(storage, mode)) {
    store.notify('warn', 'notice.appearanceNotSaved');
  }
  render();
}

// ---------- interface language ----------

// Header, page title and <html lang> follow the chosen language.
function applyLanguageToPage() {
  document.documentElement.lang = getLang();
  document.title = t('app.title');
  $('#app-title').textContent = t('app.title');
  $('#settings-btn').textContent = t('tab.settings');
  const appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appTitle) appTitle.setAttribute('content', t('app.short'));
}

// Changes only the interface text. Never touches the data document.
function setLanguage(code) {
  if (!LANGS.includes(code)) return;
  setLang(code);
  if (!saveLanguage(storage, code)) store.notify('warn', 'notice.languageNotSaved');
  render();
}

// ---------- personal planning day ----------

function finishDay() {
  const day = store.naturalToday();
  const until = dayWindow(day, store.doc.settings.day.cutoff).end;
  if (!confirm(t('confirm.finishDay', { day: { $day: day }, next: { $day: addDays(day, 1) }, until: { $dt: until } }))) return;
  const res = store.finishDay();
  if (!res.ok && !res.already) store.notify('warn', 'notice.finishNotSaved');
}

const timeValues = f => ({ wake: val(f, 'wake'), bed: val(f, 'bed'), cutoff: val(f, 'cutoff') });

// Onboarding: until the user edits the cutoff by hand, it follows the bedtime.
function rememberOnboardingDraft(e) {
  const f = e.target.form;
  if (!f || f.dataset.form !== 'onboarding.save' || !(e.target.name in ui.onb)) return;
  ui.onb[e.target.name] = e.target.value;
  if (e.target.name === 'cutoff') ui.onb.cutoffTouched = true;
  if (e.target.name === 'bed' && !ui.onb.cutoffTouched) {
    ui.onb.cutoff = e.target.value;
    const c = f.elements.namedItem('cutoff');
    if (c) c.value = e.target.value;
  }
}

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
  'upgrade.continue': () => { if (confirm(t('confirm.continueUpgrade'))) store.continueUpgradeWithoutCopy(); },
  'blocked.download': () => { if (store.status.blockedRaw) saveTextFile(store.status.blockedRaw, `organizer-raw-${dateKey(new Date())}.txt`); },
  'update.apply': () => applyUpdate(),
  'safari.hide': () => { ui.hideSafariHint = true; render(); },
  'appearance.set': el => setAppearance(el.dataset.mode),
  'language.set': el => setLanguage(el.dataset.mode),
  'day.finish': () => finishDay(),
  'day.undoFinish': () => store.undoFinishDay(),
  'day.suggest': el => {
    const f = el.closest('form');
    const c = f && f.elements.namedItem('cutoff');
    if (c) c.value = suggestCutoff(val(f, 'bed'));
  },
  'onboarding.skip': () => A.skipOnboarding(store)
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
  'import.paste': f => previewImportText(val(f, 'text')),
  'onboarding.save': f => A.finishOnboarding(store, timeValues(f)),
  'day.save': f => { if (A.setDaySettings(store, timeValues(f))) store.notify('info', 'day.saved'); }
};

const errText = e => (e && e.key ? m(e.key, e.params) : (e && e.message) || String(e));

function run(fn, el) {
  try {
    const r = fn(el);
    if (r && typeof r.catch === 'function') r.catch(e => store.notify('error', 'notice.genericError', { msg: errText(e) }));
  } catch (e) {
    console.error(e);
    store.notify('error', 'notice.genericError', { msg: errText(e) });
  }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  if (el.matches('input, select, textarea')) return; // these act on "change"
  const fn = CLICK[el.dataset.action];
  if (fn) { e.preventDefault(); run(fn, el); }
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = CHANGE[el.dataset.action];
  if (fn) run(fn, el);
});

document.addEventListener('submit', e => {
  const f = e.target;
  e.preventDefault();
  const fn = FORMS[f.dataset.form];
  if (!fn) return;
  ui.inSubmit = true;
  try { run(fn, f); } finally { ui.inSubmit = false; }
});

// Remember the quick-add draft as it is typed or picked, so redraws never lose it.
function rememberQuickDraft(e) {
  const f = e.target.form;
  if (f && f.dataset.form === 'task.quickAdd' && e.target.name in ui.quick) ui.quick[e.target.name] = e.target.value;
}
document.addEventListener('input', rememberQuickDraft);
document.addEventListener('change', rememberQuickDraft);
document.addEventListener('input', rememberOnboardingDraft);
document.addEventListener('change', rememberOnboardingDraft);

// ---------- keeping "today" current, other windows ----------

// «Сегодня» switches at the planning-day cutoff; at midnight only the
// calendar-date hint and event labels change.
function checkDayChange() {
  if (store.planningToday() !== ui.today || dateKey(new Date()) !== ui.calendarToday) render();
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
  if (e.key === KEYS.language) {
    setLang(readLanguage(storage));
    render();
  }
  if (e.key === KEYS.appearance) {
    ui.appearance = readAppearance(storage);
    applyAppearance(ui.appearance);
    render();
  }
  if (e.key === KEYS.data && store.reload()) {
    store.notify('info', 'notice.otherWindow');
  }
});

// ---------- installed app: offline cache and updates ----------

function applyUpdate() {
  const w = ui.swReg && ui.swReg.waiting;
  ui.updating = true;
  if (w) w.postMessage('skip-waiting'); else location.reload();
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) { ui.swState = m('sw.unavailable'); return; }
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    ui.swReg = reg;
    const check = () => {
      const before = JSON.stringify(ui.swState) + '|' + ui.updateReady;
      ui.swState = m(reg.active ? 'sw.ready' : 'sw.installing');
      if (reg.waiting && navigator.serviceWorker.controller) ui.updateReady = true;
      // Redraw only when something visible changed (state shows on «Данные», update banner everywhere).
      if (before !== JSON.stringify(ui.swState) + '|' + ui.updateReady && (ui.tab === 'data' || ui.updateReady)) render();
    };
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', check);
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (ui.updating) location.reload(); // only after the user pressed the update button
    });
    await navigator.serviceWorker.ready;
    check();
  } catch (e) {
    ui.swState = m('sw.error', { msg: e.message });
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
