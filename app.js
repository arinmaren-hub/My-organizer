// App entry point: loads the store, draws the current screen, and routes every
// click / change / form submit to a named handler. There are no inline event
// handler attributes in the HTML: elements carry data-action / data-form instead.

import { APP_VERSION } from './version.js';
import { createLocalStorageAdapter, KEYS } from './storage.js';
import { createStore } from './store.js';
import { hasContent } from './schema.js';
import { eveningPreviewDue } from './selectors.js';
import { uiState } from './components.js';
import { renderEvening } from './view-evening.js';
import { shiftMonth } from './calendar.js';
import { formatDay } from './i18n.js';
import { dateKey, daysBetween, addDays, weekKey } from './dates.js';
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
const VIEWS = { evening: renderEvening, today: renderToday, calendar: renderCalendar, tasks: renderTasks, projects: renderProjects, lists: renderLists, data: renderData, settings: renderSettings };

const storage = createLocalStorageAdapter();
setLang(readLanguage(storage)); // chosen by hand; Russian by default; never detected
const store = createStore({ storage });
store.load();

const ui = {
  tab: 'today',
  quick: { text: '', kind: 'none', date: '', ask: null }, // quick-add draft survives redraws; ask = a line waiting for «задача или событие?»
  editing: null,        // { kind, id } of the record being edited
  tplEdit: null,        // id of the template open in the editor
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
  if (f.dataset.id) sel += `[data-id="${CSS.escape(f.dataset.id)}"]`;
  if (f.dataset.item) sel += `[data-item="${CSS.escape(f.dataset.item)}"]`;
  if (f.dataset.coll) sel += `[data-coll="${CSS.escape(f.dataset.coll)}"]`;
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
  uiState.editing = ui.editing;
  uiState.today = ui.today;
  applyLanguageToPage();
  const onboarding = needsOnboarding();
  $('#nav').hidden = onboarding;
  $('#settings-btn').hidden = onboarding;
  const curTab = ui.tab === 'evening' ? 'today' : ui.tab; // «Вечер» belongs to «Сегодня»
  $('#nav').innerHTML = TABS.map(k =>
    `<button type="button" class="${curTab === k ? 'active' : ''}" data-action="tab" data-tab="${k}"${curTab === k ? ' aria-current="page"' : ''}>${esc(t('tab.' + k))}</button>`).join('');
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

// ---------- quick entry ----------

const quickDefaults = () => ({ kind: ui.quick.kind, date: ui.quick.date });
const whenText = spec => (spec.kind === 'week' ? t('plan.week', { day: { $day: spec.date } }) : spec.date ? `${formatDay(spec.date)}${spec.time ? ', ' + spec.time : ''}` : t('plan.none'));

// Adds every line that is ready; stops at the first line with a time and asks
// «задача или событие?». Text that was not handled stays in the box.
function quickRun() {
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
  ui.refocus = 'form[data-form="task.quickAdd"]';
  render();
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
    const d = quickDefaults();
    const kind = d.kind === 'day' || d.kind === 'week' ? d.kind : 'none';
    done = A.addTaskSpecs(store, [{ title: spec.raw, kind, date: kind === 'none' ? null : kind === 'week' ? weekKey(d.date || ui.today) : (d.date || ui.today), time: null, deadline: null }]);
  }
  if (!done) return;
  ui.quick.text = ui.quick.text.split('\n').slice(1).join('\n');
  ui.quick.ask = null;
  quickRun();
}

// ---------- evening overview ----------

function openEvening(auto) {
  ui.tab = 'evening';
  ui.editing = null;
  if (auto) {
    ui.eveningShown = ui.today;
    store.setDevice({ lastEveningPreviewShownFor: A.addDaysKey(ui.today, 1) });
  }
  render();
  window.scrollTo(0, 0);
}

// Offered only while the app is open, once per planning day, and never while the person is typing.
function maybeOpenEvening() {
  if (store.status.readOnly || needsOnboarding() || ui.tab === 'evening' || ui.tab === 'settings') return;
  const el = document.activeElement;
  if (el && el.matches && el.matches('input, textarea, select')) return;
  const dev = store.device();
  const due = eveningPreviewDue(store.doc.settings, new Date(), dev.lastEveningPreviewShownFor || null, store.doc.settings.day.cutoff, dev.dayFinishedThrough || null);
  if (due && ui.eveningShown !== A.addDaysKey(due, -1)) openEvening(true);
}

// ---------- housekeeping: recurring tasks ----------

function housekeeping() {
  if (store.status.readOnly || needsOnboarding()) return;
  const r = A.syncSeries(store);
  if (r && r.capped) store.notify('warn', 'recur.capped', { n: 60 });
}

// ---------- event routing ----------

const ids = el => String(el.dataset.ids || '').split(',').filter(Boolean);
const startEdit = (kind, id) => { ui.editing = { kind, id }; render(); };
const stopEdit = () => { ui.editing = null; render(); };

const CLICK = {
  tab: el => { ui.tab = el.dataset.tab; ui.editing = null; render(); window.scrollTo(0, 0); },
  'edit.open': el => (el.dataset.kind === 'item' ? startEdit('item', el.dataset.id) : startEdit(el.dataset.kind, el.dataset.id)),
  'edit.cancel': () => stopEdit(),
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
  'onboarding.skip': () => A.skipOnboarding(store),

  // quick entry
  'quick.asTask': () => quickAnswer('task'),
  'quick.asEvent': () => quickAnswer('event'),
  'quick.asText': () => quickAnswer('text'),
  'quick.askCancel': () => { ui.quick.ask = null; render(); },

  // reviews and the evening overview
  review: el => A.reviewTask(store, el.dataset.id, el.dataset.choice, '', el.dataset.part),
  'review.all': el => {
    const list = ids(el);
    if (list.length && confirm(t('confirm.allToTomorrow', { n: list.length }))) A.reviewManyToTomorrow(store, list, el.dataset.part);
  },
  'occ.confirm': el => A.confirmOccurrence(store, el.dataset.id, el.dataset.how),
  'evening.open': () => openEvening(false),
  'evening.close': () => { ui.tab = 'today'; render(); window.scrollTo(0, 0); },

  // waiting for others
  'wait.resolve': el => A.resolveWaiting(store, el.dataset.id, true),
  'wait.reopen': el => A.resolveWaiting(store, el.dataset.id, false),
  'wait.toTask': el => A.waitingToTask(store, el.dataset.id),
  'wait.again': el => A.setWaitingFollowUp(store, el.dataset.id, { days: Number(el.dataset.days) }),
  'wait.delete': el => confirmDelete() && A.softDelete(store, 'waiting', el.dataset.id),

  // recurring tasks
  'series.pause': el => A.pauseSeries(store, el.dataset.id, !!el.dataset.paused),
  'series.delete': el => confirmDelete() && A.softDelete(store, 'series', el.dataset.id),

  // lists and templates
  'item.delete': el => confirmDelete() && A.deleteContainerItem(store, el.dataset.coll || 'lists', el.dataset.list, el.dataset.id),
  'cat.rename': el => {
    const to = prompt(t('lists.categoryNamePh'), el.dataset.name);
    if (to && to.trim() && to !== el.dataset.name) A.renameCategory(store, el.dataset.coll, el.dataset.list, el.dataset.name, to);
  },
  'cat.remove': el => confirm(t('confirm.removeCategory', { name: el.dataset.name })) && A.removeCategory(store, el.dataset.coll, el.dataset.list, el.dataset.name),
  'list.saveTemplate': el => {
    const list = store.doc.lists.find(l => l.id === el.dataset.id);
    if (list && A.saveListAsTemplate(store, list.id)) store.notify('info', 'lists.templateSaved', { name: list.name });
  },
  'tpl.use': el => {
    const id = A.createListFromTemplate(store, el.dataset.id);
    if (id) { const l = store.doc.lists.find(x => x.id === id); store.notify('info', 'lists.created', { name: l ? l.name : '' }); }
  },
  'tpl.edit': el => { ui.tplEdit = el.dataset.id; ui.editing = null; render(); },
  'tpl.close': () => { ui.tplEdit = null; ui.editing = null; render(); },
  'tpl.delete': el => { if (confirmDelete()) { if (ui.tplEdit === el.dataset.id) ui.tplEdit = null; A.softDelete(store, 'templates', el.dataset.id); } },
  'tpl.restoreBuiltin': el => A.restoreBuiltinTemplates(store, String(el.dataset.bases).split(',').filter(Boolean)),

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
  'qty.set': el => A.setQuantity(store, el.dataset.id, el.value),
  'quick.kind': el => { const d = el.form.elements.namedItem('date'); if (d) d.hidden = el.value === 'none'; },
  // edit form: show only the fields that make sense for the chosen kind
  'edit.kind': el => { for (const f of el.form.querySelectorAll('[data-show]')) f.hidden = !f.dataset.show.split(' ').includes(el.value); },
  'import.file': el => importFile(el)
};

const fv = (f, name) => val(f, name);
const afterEdit = ok => { if (ok) { ui.editing = null; render(); } };

const FORMS = {
  'task.quickAdd': () => quickRun(),
  'event.add': f => A.addEvent(store, { title: val(f, 'title'), start: val(f, 'start') }),
  'project.add': f => A.addProject(store, { name: val(f, 'name'), total: val(f, 'total'), unit: val(f, 'unit') }),
  'milestone.add': f => {
    ui.refocus = `form[data-form="milestone.add"][data-project="${CSS.escape(f.dataset.project)}"]`;
    A.addMilestone(store, f.dataset.project, val(f, 'title'));
  },
  'list.add': f => A.addList(store, val(f, 'name')),
  'item.add': f => {
    const coll = f.dataset.coll || 'lists';
    ui.refocus = `form[data-form="item.add"][data-list="${CSS.escape(f.dataset.list)}"][data-coll="${coll}"]`;
    A.addContainerItem(store, coll, f.dataset.list, val(f, 'title'), val(f, 'category').trim() || null);
  },
  'item.edit': f => afterEdit(A.editContainerItem(store, f.dataset.coll, f.dataset.list, f.dataset.item, { title: val(f, 'title'), category: val(f, 'category').trim() || null })),
  'cat.add': f => A.addCategory(store, f.dataset.coll, f.dataset.list, val(f, 'name')),
  'tpl.add': f => { const id = A.addTemplate(store, val(f, 'name')); if (id) { ui.tplEdit = id; render(); } },
  'tpl.rename': f => A.renameContainer(store, 'templates', f.dataset.list, val(f, 'name')),
  'import.paste': f => previewImportText(val(f, 'text')),
  'onboarding.save': f => A.finishOnboarding(store, timeValues(f)),
  'day.save': f => { if (A.setDaySettings(store, timeValues(f))) store.notify('info', 'day.saved'); },
  'evening.save': f => { if (A.setEveningSettings(store, { enabled: f.elements.namedItem('enabled').checked, time: val(f, 'time') })) store.notify('info', 'evening.saved'); },
  'evening.add': f => { ui.refocus = 'form[data-form="evening.add"]'; A.addTaskSpecs(store, [{ title: val(f, 'title').trim(), kind: 'day', date: A.addDaysKey(ui.today, 1), time: null, deadline: null }]); },

  // editing
  'task.edit': f => afterEdit(A.editTask(store, f.dataset.id, { title: val(f, 'title'), kind: val(f, 'kind'), date: val(f, 'date'), time: val(f, 'time'), deadline: val(f, 'deadline') })),
  'event.edit': f => afterEdit(A.editEvent(store, f.dataset.id, { title: val(f, 'title'), start: val(f, 'start'), end: val(f, 'end') })),
  'task.moveDate': f => A.moveTask(store, f.dataset.id, 'day', val(f, 'date')),
  'review.date': f => A.reviewTask(store, f.dataset.id, 'date', val(f, 'date'), f.dataset.part),

  // waiting for others
  'wait.add': f => A.addWaiting(store, { title: val(f, 'title'), from: val(f, 'from'), followUp: val(f, 'followUp') }),
  'waiting.edit': f => afterEdit(A.editWaiting(store, f.dataset.id, { title: val(f, 'title'), from: val(f, 'from'), followUp: val(f, 'followUp'), note: val(f, 'note') })),
  'wait.snooze': f => A.setWaitingFollowUp(store, f.dataset.id, { date: val(f, 'date') }),

  // recurring tasks
  'series.add': f => A.addSeries(store, seriesValues(f)),
  'series.edit': f => afterEdit(A.editSeries(store, f.dataset.id, seriesValues(f), f.elements.namedItem('applyOpen').checked)),

  // calendar
  'cal.go': f => {
    const y = Number(val(f, 'y')), m = Number(val(f, 'm'));
    if (Number.isInteger(y) && y >= 1900 && y <= 2200 && m >= 1 && m <= 12) { Object.assign(ui.cal, { y, m, picker: false }); calKeepSel(); render(); }
  },
  'cal.add': (f, submitter) => {
    const as = submitter && submitter.value === 'event' ? 'event' : 'task';
    A.addOnDate(store, { as, title: val(f, 'title'), date: f.dataset.date, time: val(f, 'time') });
    ui.refocus = 'form[data-form="cal.add"]';
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

// Remember the quick-add draft as it is typed or picked, so redraws never lose it.
function rememberQuickDraft(e) {
  const f = e.target.form;
  if (f && f.dataset.form === 'task.quickAdd' && e.target.name in ui.quick) {
    ui.quick[e.target.name] = e.target.value;
    // The question belongs to the line as it was; once the text is edited the line may differ or
    // have moved, so the question is dropped (nothing is added or removed) and asked again on submit.
    if (e.target.name === 'text' && ui.quick.ask) { ui.quick.ask = null; render(); }
  }
}
document.addEventListener('input', rememberQuickDraft);
document.addEventListener('change', rememberQuickDraft);
document.addEventListener('input', rememberOnboardingDraft);
document.addEventListener('change', rememberOnboardingDraft);

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
housekeeping();
render();
maybeOpenEvening();
window.__organizerReady = true;
registerServiceWorker();
refreshStorageInfo();
