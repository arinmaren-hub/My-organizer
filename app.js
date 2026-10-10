// App entry point: loads the store, draws the current screen, and routes every
// click / change / form submit to a named handler. There are no inline event
// handler attributes in the HTML: elements carry data-action / data-form instead.
//
// 0.5.0 shell: a compact header (date + «···»), four tabs at the bottom, a floating «＋», and
// bottom sheets (view-sheets.js) for everything that is not "reading and ticking".

import { APP_VERSION } from './version.js';
import { createLocalStorageAdapter, KEYS } from './storage.js';
import { createStore } from './store.js';
import { hasContent } from './schema.js';
import { eveningPreviewDue } from './selectors.js';
import { uiState } from './components.js';
import { renderEvening } from './view-evening.js';
import { shiftMonth } from './calendar.js';
import { dateKey, daysBetween, addDays, isoWeekday } from './dates.js';
import { t, msg, m, setLang, getLang, readLanguage, saveLanguage, LANGS, formatDay, dayLong, weekdayLong } from './i18n.js';
import { esc } from './util.js';
import { buildBackupText, backupFileName } from './backup.js';
import * as A from './actions.js';
import { renderToday } from './view-today.js';
import { renderCalendar } from './view-calendar.js';
import { renderTasks } from './view-tasks.js';
import { renderProjects } from './view-projects.js';
import { renderLists, listsRoute } from './view-lists.js';
import { renderData, renderAbout } from './view-data.js';
import { renderSettings } from './view-settings.js';
import { renderOnboarding } from './view-onboarding.js';
import { renderSheet } from './view-sheets.js';
import { ICONS } from './icons.js';
import { dayWindow, suggestCutoff } from './planday.js';
import { MODES, readAppearance, saveAppearance, applyAppearance } from './appearance.js';

const TABS = ['today', 'calendar', 'tasks', 'lists'];
const SUBS = ['evening', 'settings', 'data', 'about', 'projects']; // screens reached from «···», with a back button
const VIEWS = { evening: renderEvening, today: renderToday, calendar: renderCalendar, tasks: renderTasks, projects: renderProjects, lists: renderLists, data: renderData, settings: renderSettings, about: renderAbout };

const storage = createLocalStorageAdapter();
setLang(readLanguage(storage)); // chosen by hand; Russian by default; never detected
const store = createStore({ storage });
store.load();

const ui = {
  tab: 'today',
  prev: 'today',        // the tab a «···» screen returns to
  list: null,           // route inside «Списки» (view-lists.js)
  sheet: null,          // the open bottom sheet: { type, ... } (view-sheets.js)
  quick: { text: '', ask: null }, // fast-entry draft survives redraws; ask = a line waiting for «задача или событие?»
  quickDate: '',        // the day fast entry writes to (planning day on Today/Tasks, selected date in Calendar)
  tplEdit: null,
  cal: { mode: 'month', y: new Date().getFullYear(), m: new Date().getMonth() + 1, sel: dateKey(new Date()), picker: false },
  eveningShown: null,
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

// A redraw that the user did not cause (offline cache ready, another window,
// midnight) must not interrupt typing: remember the focused field, its text and
// cursor, and put them back after the redraw. Not done while a form is being
// submitted, so a submitted field is still cleared normally.
function captureTyping() {
  const el = document.activeElement;
  if (ui.inSubmit || !el || !el.closest || !el.closest('#main, #sheet-root') || !el.matches('input, textarea, select') || !el.name || el.type === 'file') return null;
  const f = el.form;
  if (!f || !f.dataset.form) return null;
  let sel = `form[data-form="${CSS.escape(f.dataset.form)}"]`;
  for (const k of ['project', 'list', 'id', 'item', 'coll', 'event', 'name']) {
    if (f.dataset[k]) sel += `[data-${k}="${CSS.escape(f.dataset[k])}"]`;
  }
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
  if (document.activeElement !== el) el.focus();
  try { if (t.start != null && document.activeElement === el) el.setSelectionRange(t.start, t.end); } catch { /* not a text field */ }
}

// First-launch questions are shown until answered or skipped (never in read-only mode).
const needsOnboarding = () => !store.doc.settings.day.setupDone && !store.status.readOnly;

// What the page header shows: Today = weekday + planning date; other screens = their name.
function headerInfo(onboarding, lr) {
  if (onboarding) return { title: t('app.title'), sub: '', back: null, more: null };
  const more = { action: 'menu.app', label: t('aria.appMenu') };
  if (ui.tab === 'today') {
    const sub = [dayLong(ui.today)];
    if (ui.calendarToday !== ui.today) sub.push(t('day.calendarNow', { day: { $day: ui.calendarToday } }));
    return { title: weekdayLong(isoWeekday(ui.today) - 1), sub: sub.join(' · '), back: null, more };
  }
  if (ui.tab === 'calendar' || ui.tab === 'tasks') return { title: t('tab.' + ui.tab), sub: '', back: null, more };
  if (ui.tab === 'lists') {
    const back = lr.back ? { label: lr.route && lr.route.startsWith('t:') ? t('lists.templates') : t('tab.lists') } : null;
    return { title: lr.title, sub: lr.sub || '', back, more: lr.route === null ? more : lr.more ? { action: lr.more, label: t('aria.menu') } : null };
  }
  const names = { evening: t('menu.evening'), settings: t('tab.settings'), data: t('menu.data'), about: t('menu.about'), projects: t('tab.projects') };
  return { title: names[ui.tab] || '', sub: '', back: { label: t('tab.' + ui.prev) }, more: null };
}

// The floating «＋»: what it does depends on the screen.
function fabInfo(lr, onboarding) {
  if (onboarding || store.status.readOnly) return null;
  if (ui.tab === 'today' || ui.tab === 'tasks' || ui.tab === 'calendar') return { label: t('fab.add') };
  if (ui.tab === 'lists' && lr && lr.fab) return { label: t(lr.fab === 'newlist' ? 'lists.new' : lr.fab === 'newtpl' ? 'lists.newTemplate' : 'lists.addItem') };
  return null;
}

let lastSheetHtml = '';
const autoDismissed = new Set();

function makeCtx() {
  return {
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
  };
}

function render() {
  const typing = captureTyping();
  ui.today = store.planningToday();
  ui.calendarToday = dateKey(new Date());
  uiState.today = ui.today;
  applyLanguageToPage();
  const onboarding = needsOnboarding();
  let lr = null;
  if (ui.tab === 'lists') {
    lr = listsRoute(store.doc, ui.list);
    if (!lr) { ui.list = null; lr = listsRoute(store.doc, null); } else ui.list = lr.route;
  }
  const head = headerInfo(onboarding, lr);
  $('#app-title').textContent = head.title;
  $('#subtitle').textContent = head.sub;
  $('#subtitle').hidden = !head.sub;
  const back = $('#back-btn');
  back.hidden = !head.back;
  if (head.back) back.innerHTML = `${ICONS.back}<span>${esc(head.back.label)}</span>`;
  back.setAttribute('aria-label', t('btn.back'));
  const more = $('#more-btn');
  more.hidden = !head.more;
  if (head.more) { more.dataset.action = head.more.action; more.setAttribute('aria-label', head.more.label); more.innerHTML = head.more.action === 'menu.app' ? ICONS.gear : ICONS.more; }
  $('#nav').hidden = onboarding;
  document.body.classList.toggle('no-nav', onboarding);
  const curTab = TABS.includes(ui.tab) ? ui.tab : ui.prev;
  $('#nav').innerHTML = TABS.map(k =>
    `<button type="button" class="${curTab === k ? 'active' : ''}" data-action="tab" data-tab="${k}"${curTab === k && TABS.includes(ui.tab) ? ' aria-current="page"' : ''}>${ICONS[k]}<span>${esc(t('tab.' + k))}</span></button>`).join('');
  const fab = fabInfo(lr, onboarding);
  const fabEl = $('#fab');
  fabEl.hidden = !fab;
  if (fab) { fabEl.setAttribute('aria-label', fab.label); fabEl.innerHTML = ICONS.plus; }
  $('#banners').innerHTML = bannersHtml();
  const ctx = makeCtx();
  let html;
  try {
    const view = onboarding ? renderOnboarding : VIEWS[ui.tab];
    html = view(store.doc, ctx);
  } catch (e) {
    console.error(e);
    html = `<section class="card"><h2>${esc(t('render.errorTitle'))}</h2><p class="bad">${esc(e && e.message)}</p>
      <p>${esc(t('render.errorText'))}</p>
      <button type="button" data-action="backup.export">${esc(t('btn.saveBackup'))}</button></section>`;
  }
  $('#main').innerHTML = html;
  // The sheet is drawn separately and only rebuilt when its content changed, so an open keyboard stays open.
  let sh = '';
  if (ui.sheet && !onboarding) {
    try { sh = renderSheet(store.doc, ctx); } catch (e) { console.error(e); sh = ''; }
    if (!sh) ui.sheet = null; // the record it was about is gone
  }
  if (sh !== lastSheetHtml) { $('#sheet-root').innerHTML = sh; lastSheetHtml = sh; }
  document.body.classList.toggle('sheet-open', !!sh);
  restoreTyping(typing);
  if (ui.refocus) {
    const f = document.querySelector(ui.refocus);
    const input = f && f.querySelector('input[name="title"], textarea[name="text"]');
    if (input) input.focus();
    ui.refocus = null;
  }
  // Short confirmations fade by themselves (errors and warnings stay until dismissed).
  for (const n of store.status.notices) {
    if (n.level === 'info' && !autoDismissed.has(n.id)) {
      autoDismissed.add(n.id);
      setTimeout(() => store.dismissNotice(n.id), 5000);
    }
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
// items inside a list, template, inventory or event preparation are not shown under «Удалённые»: say so honestly
const confirmDeleteItem = () => confirm(t('confirm.deleteItem'));

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
  const nav = document.getElementById('nav');
  if (nav) nav.setAttribute('aria-label', t('aria.nav'));
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

// ---------- sheets ----------

function focusSheetField() {
  const f = document.querySelector('#sheet-root [data-focus]');
  if (f) { try { f.focus(); } catch { /* ignore */ } }
}
function openSheet(s) { ui.sheet = s; render(); focusSheetField(); }
function closeSheet() { if (ui.sheet) { ui.sheet = null; render(); } }

// Runs an action that was started from a sheet and closes the sheet when it worked.
// `fn` returns false (or throws) when nothing happened: the sheet then stays.
// What the person has typed into the open sheet's form, so a refused save (e.g. «end before start»)
// brings the sheet back with their text instead of the stored values.
function sheetValues() {
  const form = document.querySelector('#sheet-root form');
  if (!form) return null;
  return [...form.elements].filter(el => el.name && el.type !== 'file').map(el => ({ name: el.name, type: el.type, value: el.value, checked: el.checked }));
}
function applySheetValues(saved) {
  const form = document.querySelector('#sheet-root form');
  if (!form || !saved) return;
  for (const v of saved) {
    const el = form.elements.namedItem(v.name);
    if (!el || el.length !== undefined && !el.tagName) continue;
    if (v.type === 'checkbox' || v.type === 'radio') el.checked = v.checked; else el.value = v.value;
  }
}

function shut(fn) {
  const prev = ui.sheet;
  const saved = prev ? sheetValues() : null;
  ui.sheet = null;
  let r;
  try { r = fn(); } catch (e) { ui.sheet = prev; render(); applySheetValues(saved); throw e; }
  if (r === false) { ui.sheet = prev; render(); applySheetValues(saved); }
  return r;
}

const whenText = spec => (spec.kind === 'week' ? t('plan.week', { day: { $day: spec.date } }) : spec.date ? `${formatDay(spec.date)}${spec.time ? ', ' + spec.time : ''}` : t('plan.none'));

// ---------- fast entry ----------

// A day for the lines that name none: the planning day (Today, Tasks) or the selected date (Calendar).
const quickDefaults = () => ({ kind: 'day', date: ui.quickDate });

function openQuick(date) {
  ui.quickDate = date;
  ui.quick.ask = null;
  openSheet({ type: 'quick', date });
}

// Adds every line that is ready; stops at the first line with a time and asks
// «задача или событие?». Text that was not handled stays in the box.
function quickRun() {
  if (!ui.quick.text.trim()) return;
  const r = A.splitQuick(ui.quick.text, quickDefaults(), ui.today);
  if (r.specs.length) {
    if (!A.addTaskSpecs(store, r.specs)) return; // failed: the text stays, the message is shown
    const first = r.specs.find(x => x.recognized);
    if (first) {
      store.notify('info', r.specs.filter(x => x.recognized).length > 1 ? 'quick.addedMany' : 'quick.added',
        { n: r.specs.filter(x => x.recognized).length, title: first.title, when: whenText(first) });
    }
  }
  ui.quick.text = r.rest;
  ui.quick.ask = r.ask;
  if (!r.rest && !r.ask) ui.sheet = null; // everything was added
  render();
  if (ui.sheet) focusSheetField();
}

// The answer to the question about a line with a time; the rest of the text goes on.
function quickAnswer(how) {
  const spec = ui.quick.ask;
  if (!spec) return;
  let done;
  if (how === 'task') done = A.addTaskSpecs(store, [spec]);
  else if (how === 'event') {
    done = A.addEventFromSpec(store, spec);
    if (done) store.notify('info', 'quick.eventAdded', { title: spec.title, when: whenText(spec) });
  } else {
    done = A.addTaskSpecs(store, [{ title: spec.raw, kind: 'day', date: ui.quickDate || ui.today, time: null, deadline: null }]);
  }
  if (!done) return;
  ui.quick.text = ui.quick.text.split('\n').slice(1).join('\n');
  ui.quick.ask = null;
  if (!ui.quick.text.trim()) { ui.quick.text = ''; ui.sheet = null; render(); return; }
  quickRun();
}

// ---------- evening overview ----------

function goTo(tab) {
  if (TABS.includes(ui.tab)) ui.prev = ui.tab;
  ui.tab = tab;
  ui.sheet = null;
}

function openEvening(auto) {
  goTo('evening');
  if (auto) {
    ui.eveningShown = ui.today;
    store.setDevice({ lastEveningPreviewShownFor: A.addDaysKey(ui.today, 1) });
  }
  render();
  window.scrollTo(0, 0);
}

// Offered only while the app is open, once per planning day, and never while the person is typing.
function maybeOpenEvening() {
  if (store.status.readOnly || needsOnboarding() || ui.tab === 'evening' || ui.tab === 'settings' || ui.sheet) return;
  const el = document.activeElement;
  if (el && el.matches && el.matches('input, textarea, select')) return;
  const dev = store.device();
  const due = eveningPreviewDue(store.doc.settings, new Date(), dev.lastEveningPreviewShownFor || null, store.doc.settings.day.cutoff, dev.dayFinishedThrough || null);
  if (due && ui.eveningShown !== A.addDaysKey(due, -1)) openEvening(true);
}

// ---------- housekeeping: recurring tasks, tails lose their indentation ----------

function housekeeping() {
  if (store.status.readOnly || needsOnboarding()) return;
  const r = A.syncSeries(store);
  if (r && r.capped) store.notify('warn', 'recur.capped', { n: 60 });
  A.clearTailIndents(store);
}

// ---------- event routing ----------

const ids = el => String(el.dataset.ids || '').split(',').filter(Boolean);
const goBack = () => {
  if (SUBS.includes(ui.tab)) { ui.tab = ui.prev || 'today'; }
  else if (ui.tab === 'lists') ui.list = ui.list && ui.list.startsWith('t:') ? 'templates' : null;
  ui.sheet = null;
  render();
  window.scrollTo(0, 0);
};
const listRoute = () => {
  const r = listsRoute(store.doc, ui.list);
  return r && r.c ? r : null;
};

const CLICK = {
  tab: el => {
    const k = el.dataset.tab;
    if (ui.tab === k && k === 'lists') ui.list = null;
    ui.tab = k; ui.sheet = null;
    render(); window.scrollTo(0, 0);
  },
  go: el => { goTo(el.dataset.tab); render(); window.scrollTo(0, 0); },
  back: () => goBack(),
  fab: () => {
    if (ui.tab === 'calendar') return openQuick(ui.cal.sel);
    if (ui.tab !== 'lists') return openQuick(ui.today);
    const r = listsRoute(store.doc, ui.list);
    if (!r || !r.fab) return;
    if (r.fab === 'additems') openSheet({ type: 'additems', coll: r.coll, list: r.c.id });
    else openSheet({ type: r.fab });
  },
  fold: el => {
    const open = el.getAttribute('aria-expanded') === 'true';
    uiState.fold[el.dataset.key] = !open;
    el.setAttribute('aria-expanded', String(!open));
    const body = el.nextElementSibling;
    if (body) body.hidden = open;
    const chev = el.querySelector('.chev');
    if (chev) chev.classList.toggle('open', !open);
  },

  // sheets and menus
  'sheet.close': () => closeSheet(),
  'series.new': () => openSheet({ type: 'seriesnew' }),
  'sheet.move': el => openSheet({ type: 'move', id: el.dataset.id }),
  'sheet.rename': el => openSheet({ type: 'rename', coll: el.dataset.coll, id: el.dataset.id }),
  'sheet.cats': el => openSheet({ type: 'cats', coll: el.dataset.coll, id: el.dataset.id }),
  'menu.app': () => openSheet({ type: 'appmenu' }),
  'menu.task': el => openSheet({ type: 'taskmenu', id: el.dataset.id, part: el.dataset.part || '' }),
  'menu.event': el => openSheet({ type: 'eventmenu', id: el.dataset.id }),
  'menu.wait': el => openSheet({ type: 'waitmenu', id: el.dataset.id }),
  'menu.series': el => openSheet({ type: 'seriesmenu', id: el.dataset.id }),
  'menu.tpl': el => openSheet({ type: 'tplmenu', id: el.dataset.id }),
  'menu.list': () => { const r = listRoute(); if (r) openSheet({ type: 'listmenu', coll: r.coll, id: r.c.id }); },
  'task.open': el => openSheet({ type: 'edit', kind: 'task', id: el.dataset.id }),
  'event.open': el => openSheet({ type: 'event', id: el.dataset.id }),
  'edit.open': el => openSheet({ type: 'edit', kind: el.dataset.kind, id: el.dataset.id, coll: el.dataset.coll, list: el.dataset.list }),
  'tail.pick': el => openSheet({ type: 'pick', id: el.dataset.id, part: el.dataset.part }),
  'convert.open': el => openSheet({ type: 'convert', from: el.dataset.from, id: el.dataset.id }),
  'wait.new': () => openSheet({ type: 'waitadd' }),

  // tasks
  'task.move': el => shut(() => A.moveTask(store, el.dataset.id, el.dataset.kind)),
  'task.delete': el => shut(() => confirmDelete() && A.softDelete(store, 'tasks', el.dataset.id)),
  'task.duplicate': el => shut(() => A.duplicateTask(store, el.dataset.id)),
  'task.toWaiting': el => shut(() => A.taskToWaiting(store, el.dataset.id)),
  'event.delete': el => shut(() => confirmDelete() && A.softDelete(store, 'events', el.dataset.id)),
  'project.delete': el => confirmDelete() && A.softDelete(store, 'projects', el.dataset.id),
  'qty.step': el => A.stepQuantity(store, el.dataset.id, Number(el.dataset.delta)),
  restore: el => {
    const clash = A.restoreConflicts(store.doc, el.dataset.collection, el.dataset.id);
    if (clash.length && !confirm(t('confirm.restoreConverted', { title: clash[0].title, kind: t(`kind.${clash[0].collection}`) }))) return;
    A.restoreDeleted(store, el.dataset.collection, el.dataset.id, { confirmed: clash.length > 0 });
  },
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
  'day.finish': () => shut(() => finishDay()),
  'day.undoFinish': () => shut(() => store.undoFinishDay()),
  'day.suggest': el => {
    const f = el.closest('form');
    const c = f && f.elements.namedItem('cutoff');
    if (c) c.value = suggestCutoff(val(f, 'bed'));
  },
  'onboarding.skip': () => A.skipOnboarding(store),

  // quick entry
  'quick.asTask': () => quickAnswer('task'),
  'quick.asEvent': () => quickAnswer('event'),
  'quick.asText': () => quickAnswer('text'),
  'quick.askCancel': () => { ui.quick.ask = null; render(); },

  // reviews and the evening overview
  review: el => shut(() => A.reviewTask(store, el.dataset.id, el.dataset.choice, '', el.dataset.part)),
  'review.all': el => {
    const list = ids(el);
    if (list.length && confirm(t('confirm.allToTomorrow', { n: list.length }))) A.reviewManyToTomorrow(store, list, el.dataset.part);
  },
  'occ.confirm': el => A.confirmOccurrence(store, el.dataset.id, el.dataset.how),
  'evening.open': () => openEvening(false),
  'evening.close': () => goBack(),

  // waiting for others
  'wait.resolve': el => shut(() => A.resolveWaiting(store, el.dataset.id, true)),
  'wait.reopen': el => shut(() => A.resolveWaiting(store, el.dataset.id, false)),
  'wait.toTask': el => shut(() => A.waitingToTask(store, el.dataset.id)),
  'wait.again': el => shut(() => A.setWaitingFollowUp(store, el.dataset.id, { days: Number(el.dataset.days) })),
  'wait.delete': el => shut(() => confirmDelete() && A.softDelete(store, 'waiting', el.dataset.id)),

  // recurring tasks
  'series.pause': el => shut(() => A.pauseSeries(store, el.dataset.id, !!el.dataset.paused)),
  'series.delete': el => shut(() => confirmDelete() && A.softDelete(store, 'series', el.dataset.id)),

  // event preparation
  'prep.create': el => { if (A.createPrep(store, el.dataset.id)) { uiState.fold.prep = true; render(); } },
  'prep.edit': el => openSheet({ type: 'prepedit', event: el.dataset.event, id: el.dataset.id }),
  'prep.back': el => openSheet({ type: 'event', id: el.dataset.event }),
  'prep.delete': el => {
    if (confirmDeleteItem() && A.deletePrepItem(store, el.dataset.event, el.dataset.id)) openSheet({ type: 'event', id: el.dataset.event });
  },

  // lists and templates
  'list.open': el => { ui.list = el.dataset.route; render(); window.scrollTo(0, 0); },
  'stock.open': el => openSheet({ type: 'stock', id: el.dataset.id }),
  'stock.set': el => shut(() => A.setStock(store, el.dataset.id, el.dataset.stock)),
  'list.delete': el => shut(() => {
    if (!confirmDelete()) return false;
    const ok = A.softDelete(store, 'lists', el.dataset.id);
    if (ok && ui.list === 'l:' + el.dataset.id) ui.list = null;
    return ok;
  }),
  'item.delete': el => shut(() => confirmDeleteItem() && A.deleteContainerItem(store, el.dataset.coll || 'lists', el.dataset.list, el.dataset.id)),
  'cat.renameOpen': el => { if (ui.sheet) { ui.sheet = { ...ui.sheet, renaming: el.dataset.name }; render(); } },
  'cat.remove': el => confirm(t('confirm.removeCategory', { name: el.dataset.name })) && A.removeCategory(store, el.dataset.coll, el.dataset.list, el.dataset.name),
  'list.saveTemplate': el => shut(() => {
    const list = store.doc.lists.find(l => l.id === el.dataset.id);
    const ok = !!list && A.saveListAsTemplate(store, list.id);
    if (ok) store.notify('info', 'lists.templateSaved', { name: list.name });
    return ok;
  }),
  'tpl.use': el => shut(() => {
    const id = A.createListFromTemplate(store, el.dataset.id);
    if (!id) return false;
    const l = store.doc.lists.find(x => x.id === id);
    store.notify('info', 'lists.created', { name: l ? l.name : '' });
    ui.tab = 'lists'; ui.list = 'l:' + id; render(); window.scrollTo(0, 0);
    return true;
  }),
  'tpl.edit': el => { ui.sheet = null; ui.tab = 'lists'; ui.list = 't:' + el.dataset.id; render(); window.scrollTo(0, 0); },
  'tpl.manage': () => { ui.sheet = null; ui.tab = 'lists'; ui.list = 'templates'; render(); window.scrollTo(0, 0); },
  'tpl.delete': el => shut(() => {
    if (!confirmDelete()) return false;
    const ok = A.softDelete(store, 'templates', el.dataset.id);
    if (ok && ui.list && ui.list.startsWith('t:')) ui.list = 'templates';
    return ok;
  }),
  'tpl.restoreBuiltin': el => shut(() => A.restoreBuiltinTemplates(store, String(el.dataset.bases).split(',').filter(Boolean))),

  // calendar
  'cal.select': el => { ui.cal.sel = el.dataset.date; render(); },
  'cal.prev': () => { const n = shiftMonth(ui.cal.y, ui.cal.m, -1); Object.assign(ui.cal, { y: n.y, m: n.m }); calKeepSel(); render(); },
  'cal.next': () => { const n = shiftMonth(ui.cal.y, ui.cal.m, 1); Object.assign(ui.cal, { y: n.y, m: n.m }); calKeepSel(); render(); },
  'cal.prevYear': () => { ui.cal.y = Math.max(1900, ui.cal.y - 1); render(); },
  'cal.nextYear': () => { ui.cal.y = Math.min(2200, ui.cal.y + 1); render(); },
  'cal.today': () => { const d = dateKey(new Date()); Object.assign(ui.cal, { y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)), sel: d, mode: 'month', picker: false }); render(); },
  'cal.mode': el => { ui.cal.mode = el.dataset.mode; ui.cal.picker = false; render(); },
  'cal.pickToggle': () => { ui.cal.picker = !ui.cal.picker; render(); },
  'cal.openMonth': el => { Object.assign(ui.cal, { y: Number(el.dataset.y), m: Number(el.dataset.m), mode: 'month' }); calKeepSel(); render(); }
};

// Moving to another month selects the same day number there (or the 1st).
function calKeepSel() {
  const day = Math.min(Number(ui.cal.sel.slice(8)), new Date(ui.cal.y, ui.cal.m, 0).getDate());
  ui.cal.sel = `${String(ui.cal.y).padStart(4, '0')}-${String(ui.cal.m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const CHANGE = {
  'task.toggle': el => A.setTaskDone(store, el.dataset.id, el.checked),
  'milestone.toggle': el => A.setMilestoneDone(store, el.dataset.project, el.dataset.id, el.checked),
  'item.toggle': el => A.setListItemDone(store, el.dataset.list, el.dataset.id, el.checked),
  'buy.toggle': el => { if (el.checked) A.markBought(store, el.dataset.id); },
  'prep.toggle': el => A.setPrepDone(store, el.dataset.event, el.dataset.id, el.checked),
  'qty.set': el => A.setQuantity(store, el.dataset.id, el.value),
  // edit form: show only the fields that make sense for the chosen kind
  'edit.kind': el => { for (const f of el.form.querySelectorAll('[data-show]')) f.hidden = !f.dataset.show.split(' ').includes(el.value); },
  'import.file': el => importFile(el)
};

const FORMS = {
  'task.quickAdd': () => quickRun(),
  'event.add': f => A.addEvent(store, { title: val(f, 'title'), start: val(f, 'start') }),
  'project.add': f => A.addProject(store, { name: val(f, 'name'), total: val(f, 'total'), unit: val(f, 'unit') }),
  'milestone.add': f => {
    ui.refocus = `form[data-form="milestone.add"][data-project="${CSS.escape(f.dataset.project)}"]`;
    A.addMilestone(store, f.dataset.project, val(f, 'title'));
  },
  'list.add': f => shut(() => {
    const id = A.addList(store, val(f, 'name'));
    if (id && typeof id === 'string') { ui.list = 'l:' + id; render(); window.scrollTo(0, 0); }
    return !!id;
  }),
  'list.rename': f => shut(() => A.renameContainer(store, 'lists', f.dataset.list, val(f, 'name'))),
  'items.add': f => shut(() => A.addContainerItems(store, f.dataset.coll, f.dataset.list, val(f, 'text'), val(f, 'category').trim() || null)),
  'home.add': f => shut(() => {
    const ok = A.addHomeItems(store, val(f, 'text'));
    if (ok === true) store.notify('info', 'lists.homeDup'); // nothing new: every name was already there
    return ok;
  }),
  'item.edit': f => shut(() => A.editContainerItem(store, f.dataset.coll, f.dataset.list, f.dataset.item, { title: val(f, 'title'), category: val(f, 'category').trim() || null })),
  'cat.add': f => A.addCategory(store, f.dataset.coll, f.dataset.list, val(f, 'name')),
  'cat.rename': f => {
    if (A.renameCategory(store, f.dataset.coll, f.dataset.list, f.dataset.name, val(f, 'name'))) { if (ui.sheet) ui.sheet = { ...ui.sheet, renaming: null }; render(); }
  },
  'tpl.add': f => shut(() => {
    const id = A.addTemplate(store, val(f, 'name'));
    if (id && typeof id === 'string') { ui.tab = 'lists'; ui.list = 't:' + id; }
    return !!id;
  }),
  'tpl.rename': f => shut(() => A.renameContainer(store, 'templates', f.dataset.list, val(f, 'name'))),
  'import.paste': f => previewImportText(val(f, 'text')),
  'onboarding.save': f => A.finishOnboarding(store, timeValues(f)),
  'day.save': f => { if (A.setDaySettings(store, timeValues(f))) store.notify('info', 'day.saved'); },
  'evening.save': f => { if (A.setEveningSettings(store, { enabled: f.elements.namedItem('enabled').checked, time: val(f, 'time') })) store.notify('info', 'evening.saved'); },
  'evening.add': f => { ui.refocus = 'form[data-form="evening.add"]'; A.addTaskSpecs(store, [{ title: val(f, 'title').trim(), kind: 'day', date: A.addDaysKey(ui.today, 1), time: null, deadline: null }]); },

  // editing (inside sheets)
  'task.edit': f => shut(() => A.editTask(store, f.dataset.id, { title: val(f, 'title'), kind: val(f, 'kind'), date: val(f, 'date'), time: val(f, 'time'), deadline: val(f, 'deadline') })),
  'event.edit': f => shut(() => A.editEvent(store, f.dataset.id, { title: val(f, 'title'), start: val(f, 'start'), end: val(f, 'end') })),
  'task.moveDate': f => shut(() => A.moveTask(store, f.dataset.id, 'day', val(f, 'date'))),
  'review.date': f => shut(() => A.reviewTask(store, f.dataset.id, 'date', val(f, 'date'), f.dataset.part)),
  'convert.go': f => shut(() => {
    const confirmed = f.dataset.confirmed === '1';
    const ok = f.dataset.from === 'task'
      ? A.convertTaskToEvent(store, f.dataset.id, { date: val(f, 'date'), time: val(f, 'time'), confirmed })
      : A.convertEventToTask(store, f.dataset.id, { confirmed });
    if (ok) store.notify('info', 'conv.done');
    return ok;
  }),
  'prep.add': f => {
    ui.refocus = `form[data-form="prep.add"][data-event="${CSS.escape(f.dataset.event)}"]`;
    A.addPrepItems(store, f.dataset.event, val(f, 'title'));
  },
  'prep.edit': f => { if (A.editPrepItem(store, f.dataset.event, f.dataset.id, val(f, 'title'))) openSheet({ type: 'event', id: f.dataset.event }); },

  // waiting for others
  'wait.add': f => shut(() => A.addWaiting(store, { title: val(f, 'title'), from: val(f, 'from'), followUp: val(f, 'followUp') })),
  'waiting.edit': f => shut(() => A.editWaiting(store, f.dataset.id, { title: val(f, 'title'), from: val(f, 'from'), followUp: val(f, 'followUp'), note: val(f, 'note') })),

  // recurring tasks
  'series.add': f => shut(() => A.addSeries(store, seriesValues(f))),
  'series.edit': f => shut(() => A.editSeries(store, f.dataset.id, seriesValues(f), f.elements.namedItem('applyOpen').checked)),

  // calendar
  'cal.go': f => {
    const y = Number(val(f, 'y')), m = Number(val(f, 'm'));
    if (Number.isInteger(y) && y >= 1900 && y <= 2200 && m >= 1 && m <= 12) { Object.assign(ui.cal, { y, m, picker: false }); calKeepSel(); render(); }
  }
};

const seriesValues = f => ({ title: val(f, 'title'), freq: val(f, 'freq'), interval: val(f, 'interval'), mode: val(f, 'mode'), startDate: val(f, 'startDate'), time: val(f, 'time') });

const errText = e => (e && e.key ? m(e.key, e.params) : (e && e.message) || String(e));

function run(fn, el, extra) {
  try {
    const r = fn(el, extra);
    if (r && typeof r.catch === 'function') r.catch(e => store.notify('error', 'notice.genericError', { msg: errText(e) }));
  } catch (e) {
    console.error(e);
    store.notify('error', 'notice.genericError', { msg: errText(e) });
  }
}

// A swipe or a long press must not also count as a tap on the row.
let suppressUntil = 0;
document.addEventListener('click', e => {
  if (Date.now() < suppressUntil) { e.preventDefault(); e.stopPropagation(); }
}, true);

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
  try { run(fn, f, e.submitter); } finally { ui.inSubmit = false; }
});

// Rows that look like buttons also answer to the keyboard.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ui.sheet) { closeSheet(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"][data-action]')) {
    e.preventDefault();
    e.target.click();
  }
});

// Remember the fast-entry draft as it is typed, so redraws never lose it.
function rememberQuickDraft(e) {
  const f = e.target.form;
  if (f && f.dataset.form === 'task.quickAdd' && e.target.name === 'text') {
    ui.quick.text = e.target.value;
    // The question belongs to the line as it was; once the text is edited the line may differ or
    // have moved, so the question is dropped (nothing is added or removed) and asked again on submit.
    if (ui.quick.ask) { ui.quick.ask = null; render(); }
  }
}
document.addEventListener('input', rememberQuickDraft);
document.addEventListener('input', rememberOnboardingDraft);
document.addEventListener('change', rememberOnboardingDraft);

// ---------- swipe (indentation) and long press on rows ----------

const ROW_SEL = '.trow, .tailrow, .erow, .wrow, .srow';
const SWIPE_MIN = 44;
let gesture = null;

function openRowMenu(row) {
  const id = row.dataset.id;
  if (!id) return;
  const type = row.matches('.erow') ? 'eventmenu' : row.matches('.wrow') ? 'waitmenu' : row.matches('.srow') ? 'seriesmenu' : 'taskmenu';
  openSheet({ type, id, part: row.matches('.tailrow') ? row.querySelector('[data-part]') && row.querySelector('[data-part]').dataset.part : undefined });
}

function endGesture() {
  if (!gesture) return;
  clearTimeout(gesture.timer);
  gesture.row.style.transform = '';
  gesture.row.classList.remove('swiping');
  gesture = null;
}

document.addEventListener('pointerdown', e => {
  if (ui.sheet || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const row = e.target.closest && e.target.closest(ROW_SEL);
  if (!row || e.target.closest('input, button, a, select, textarea')) return;
  endGesture();
  gesture = { row, x: e.clientX, y: e.clientY, mode: null, swipe: row.hasAttribute('data-swipe'), pid: e.pointerId, dx: 0 };
  gesture.timer = setTimeout(() => {
    if (gesture && gesture.mode === null) { gesture.mode = 'long'; suppressUntil = Infinity; const r = gesture.row; endGesture(); openRowMenu(r);
      // if the release never reaches the page (the row was redrawn under the finger), do not stay blocked
      setTimeout(() => { if (suppressUntil === Infinity) suppressUntil = Date.now() + 400; }, 3000); }
  }, 520);
});

document.addEventListener('pointermove', e => {
  const g = gesture;
  if (!g || e.pointerId !== g.pid) return;
  const dx = e.clientX - g.x, dy = e.clientY - g.y;
  if (g.mode === null) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { endGesture(); return; } // vertical: that is scrolling
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearTimeout(g.timer);               // moved: not a long press
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      if (!g.swipe) { endGesture(); return; }
      g.mode = 'swipe';
      g.row.classList.add('swiping');
    }
  }
  if (g.mode === 'swipe') {
    g.dx = dx;
    g.row.style.transform = `translateX(${Math.max(-30, Math.min(30, dx / 2))}px)`;
  }
});

document.addEventListener('pointerup', e => {
  const g = gesture;
  if (suppressUntil === Infinity) suppressUntil = Date.now() + 400; // the long press has been released
  if (!g || e.pointerId !== g.pid) return;
  const mode = g.mode, dx = g.dx, id = g.row.dataset.id;
  endGesture();
  if (mode === 'swipe') {
    suppressUntil = Date.now() + 400;
    const task = store.doc.tasks.find(x => x.id === id && !x.deletedAt);
    if (task && dx >= SWIPE_MIN && !task.indent) A.setIndent(store, id, true);
    else if (task && dx <= -SWIPE_MIN && task.indent) A.setIndent(store, id, false);
  }
});
document.addEventListener('pointercancel', () => { endGesture(); if (suppressUntil === Infinity) suppressUntil = Date.now() + 400; });

// A right click opens the same menu as a long press.
document.addEventListener('contextmenu', e => {
  const row = e.target.closest && e.target.closest(ROW_SEL);
  if (row && !ui.sheet && !e.target.closest('input, textarea, select')) { e.preventDefault(); openRowMenu(row); }
});

// ---------- keyboard: keep the sheet and «＋» above it ----------

if (window.visualViewport) {
  const vv = window.visualViewport;
  const update = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb', kb + 'px');
    document.documentElement.classList.toggle('kb-open', kb > 120);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

// ---------- keeping "today" current, other windows ----------

// «Сегодня» switches at the planning-day cutoff; at midnight only the
// calendar-date hint and event labels change.
function checkDayChange() {
  const changed = store.planningToday() !== ui.today || dateKey(new Date()) !== ui.calendarToday;
  if (store.planningToday() !== ui.today) housekeeping();   // a new planning day: recurring tasks come due
  if (changed) render();
  maybeOpenEvening();
}
setInterval(checkDayChange, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    housekeeping();
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
      if (before !== JSON.stringify(ui.swState) + '|' + ui.updateReady && (ui.tab === 'data' || ui.tab === 'about' || ui.updateReady)) render();
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
  if (ui.tab === 'data' || ui.tab === 'about') render();
}

// ---------- start ----------
housekeeping();
render();
maybeOpenEvening();
window.__organizerReady = true;
registerServiceWorker();
refreshStorageInfo();
