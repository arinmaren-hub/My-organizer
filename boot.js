// Plain (non-module) safety net. If the app has not started within a few
// seconds, show a readable message instead of a blank page.
(function () {
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
