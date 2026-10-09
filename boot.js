// Plain (non-module) script that runs before the page is drawn.
// 1. Applies the saved appearance at once, so a dark choice never flashes light.
// 2. Sets the page language from the saved choice (Russian by default; never detected).
//    Both are read-only; the key names must match KEYS in storage.js — tests check it.
// 3. Safety net: if the app has not started within a few seconds, show a
//    readable message instead of a blank page (in the chosen language).
// This file is the one place outside i18n.js with interface text, because it
// must work even when the app's modules fail to load.
(function () {
  var lang = 'ru';
  try {
    var mode = window.localStorage.getItem('organizer:appearance');
    if (mode === 'light' || mode === 'dark') document.documentElement.setAttribute('data-theme', mode);
    if (window.localStorage.getItem('organizer:language') === 'en') lang = 'en';
  } catch (e) { /* storage unavailable: defaults */ }
  document.documentElement.lang = lang;

  var TEXT = {
    ru: {
      title: 'Мой органайзер',
      file: 'Приложение открыто как файл. Оно работает только по адресу https://… (см. README.md, раздел «Публикация»).',
      fail: 'Приложение не запустилось. Данные не затронуты. Попробуйте обновить страницу; если не поможет — пришлите текст ниже.'
    },
    en: {
      title: 'My Organizer',
      file: 'The app was opened as a file. It only works from an https://… address (see README.md, “Publish”).',
      fail: 'The app did not start. Your data is not affected. Try reloading the page; if that does not help, send the text below.'
    }
  }[lang];

  var errors = [];
  window.addEventListener('error', function (e) { errors.push(e.message || String(e.error || e)); });
  window.addEventListener('unhandledrejection', function (e) { errors.push(String(e.reason && e.reason.message || e.reason)); });
  setTimeout(function () {
    if (window.__organizerReady) return;
    var box = document.getElementById('boot-error');
    if (!box) return;
    var title = document.getElementById('app-title');
    if (title && !title.textContent) title.textContent = TEXT.title;
    box.hidden = false;
    box.textContent = (location.protocol === 'file:' ? TEXT.file : TEXT.fail) + (errors.length ? '\n\n' + errors.join('\n') : '');
  }, 4000);
})();
