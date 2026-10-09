// Plain (non-module) script that runs before the page is drawn.
// 1. Applies the saved appearance at once, so a dark choice never flashes light.
//    (Read-only; the key name must match KEYS.appearance in storage.js — tests check it.)
// 2. Safety net: if the app has not started within a few seconds, show a
//    readable message instead of a blank page.
(function () {
  try {
    var mode = window.localStorage.getItem('organizer:appearance');
    if (mode === 'light' || mode === 'dark') document.documentElement.setAttribute('data-theme', mode);
  } catch (e) { /* storage unavailable: follow the system */ }

  var errors = [];
  window.addEventListener('error', function (e) { errors.push(e.message || String(e.error || e)); });
  window.addEventListener('unhandledrejection', function (e) { errors.push(String(e.reason && e.reason.message || e.reason)); });
  setTimeout(function () {
    if (window.__organizerReady) return;
    var box = document.getElementById('boot-error');
    if (!box) return;
    var msg = location.protocol === 'file:'
      ? 'Приложение открыто как файл. Оно работает только по адресу https://… (см. README.md, раздел «Публикация»).'
      : 'Приложение не запустилось. Данные не затронуты. Попробуйте обновить страницу; если не поможет — пришлите текст ниже.';
    box.hidden = false;
    box.textContent = msg + (errors.length ? '\n\n' + errors.join('\n') : '');
  }, 4000);
})();
