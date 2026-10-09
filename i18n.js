// Interface language: every text the app shows lives here, in Russian and English.
// The language is chosen by hand (no automatic detection), Russian by default,
// and saved on this device under KEYS.language (not in the data or backups).
//
//   t('key', { name: value })   → text in the current language
//   msg(x)                      → x may be a key, a { key, params } object, or plain
//                                 text (e.g. an older saved reason) — plain text is
//                                 shown as it is
// Placeholders: {name} inserts a value; {name|form1|form2|form3} picks a plural
// form for the number in `name` (Russian: one/few/many, English: one/other).
// Param values can be { $t: key, params }, { $stamp: iso }, { $day: 'YYYY-MM-DD' },
// { $dt: 'YYYY-MM-DDTHH:MM' } or { $counts: {tasks, events, projects, lists} }.

import { KEYS } from './storage.js';
import { parseDateKey, isDateKey, isDateTime, timeOf } from './dates.js';

export const LANGS = ['ru', 'en'];
// Each language is named in its own language, as is usual.
export const LANG_NAMES = { ru: 'Русский', en: 'English' };
export const DEFAULT_LANG = 'ru';
let lang = DEFAULT_LANG;

// Keys looked up but missing in the current language (tests check this stays empty).
export const missing = new Set();
if (typeof window !== 'undefined') window.__i18nMissing = missing;

export function setLang(l) { lang = LANGS.includes(l) ? l : DEFAULT_LANG; }
export function getLang() { return lang; }

export function readLanguage(storage) {
  try { const v = storage.get(KEYS.language); return LANGS.includes(v) ? v : DEFAULT_LANG; } catch { return DEFAULT_LANG; }
}
// true = saved; false = could not be written (still applies until the app closes).
export function saveLanguage(storage, l) {
  if (!LANGS.includes(l)) throw new Error('unknown language');
  try { storage.set(KEYS.language, l); return true; } catch { return false; }
}

// ---------- plural rules ----------
function pluralIndex(n, l = lang) {
  const a = Math.abs(Number(n));
  if (l === 'ru') {
    if (!Number.isInteger(a)) return 1;
    const d = a % 10, h = a % 100;
    if (d === 1 && h !== 11) return 0;
    if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 1;
    return 2;
  }
  return a === 1 ? 0 : 1;
}

// ---------- dates in words ----------
const WD = {
  ru: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
};
const MON = {
  ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
};

// 'пт, 9 окт' / 'Fri, 9 Oct'
export function formatDay(key) {
  if (!isDateKey(key)) return typeof key === 'string' ? key : '';
  const d = parseDateKey(key);
  return `${WD[lang][d.getDay()]}, ${d.getDate()} ${MON[lang][d.getMonth()]}`;
}
// 'пт, 9 окт, 10:00'
export function formatDateTime(dt) {
  if (!isDateTime(dt)) return typeof dt === 'string' ? dt : '';
  return `${formatDay(dt.slice(0, 10))}, ${dt.slice(11)}`;
}
// ISO timestamp → '9 окт 2026, 19:42' (local time)
export function formatStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MON[lang][d.getMonth()]} ${d.getFullYear()}, ${timeOf(d)}`;
}

// ---------- texts ----------
const RU = {
  'app.title': 'Мой органайзер',
  'app.short': 'Органайзер',
  'tab.today': 'Сегодня', 'tab.calendar': 'Календарь', 'tab.tasks': 'Задачи',
  'tab.projects': 'Прогресс', 'tab.lists': 'Списки', 'tab.data': 'Данные', 'tab.settings': 'Настройки',

  'status.readOnly': 'Только чтение',
  'status.notSaved': '⚠ Не сохранено',
  'status.saved': 'Сохранено {time}',
  'status.idle': 'Версия {v} · данные только на этом устройстве',

  'banner.readOnly': 'Только чтение.',
  'banner.saveFailed': 'Не удалось сохранить:',
  'banner.saveFailedTail': 'Последние изменения пока только в памяти — сохраните копию.',
  'banner.update': 'Доступна новая версия приложения.',
  'banner.safari': 'Открыто в Safari. У Safari и значка на экране «Домой» раздельные данные — установите приложение и пользуйтесь только значком.',
  'btn.retry': 'Повторить', 'btn.saveBackup': 'Сохранить копию', 'btn.update': 'Обновить',
  'btn.hide': 'Скрыть', 'btn.delete': 'Удалить', 'btn.add': 'Добавить', 'btn.create': 'Создать',
  'btn.restore': 'Восстановить', 'btn.download': 'Скачать', 'btn.cancel': 'Отмена',

  'backup.none': 'Резервной копии с этого устройства ещё не было.',
  'backup.daysAgo': 'Последняя резервная копия: {days} дн. назад.',

  'render.errorTitle': 'Ошибка отображения',
  'render.errorText': 'Данные не потеряны. Сохраните копию и сообщите об ошибке.',

  'notice.copied': 'Текст копии скопирован. Вставьте его, например, в Заметки.',
  'notice.copyFailed': 'Не удалось скопировать автоматически: текст выделен, скопируйте его вручную.',
  'notice.genericError': 'Ошибка: {msg}',
  'notice.otherWindow': 'Данные изменены в другом окне — показаны актуальные.',
  'notice.appearanceNotSaved': 'Не удалось сохранить выбор оформления — он действует до закрытия приложения.',
  'notice.languageNotSaved': 'Не удалось сохранить выбор языка — он действует до закрытия приложения.',
  'notice.restoreFailedShort': 'Не удалось восстановить: {reason}',

  'confirm.delete': 'Удалить? Восстановить можно во вкладке «Данные» в течение 30 дней.',
  'confirm.import': 'Заменить все текущие данные данными из копии?',
  'confirm.importForce': 'Не удалось сделать автокопию текущих данных (мало места). Если вы не сохранили копию сами, текущие данные пропадут. Всё равно заменить?',
  'confirm.restore': 'Восстановить данные из этой автокопии? Текущее состояние тоже будет сохранено в автокопиях.',
  'confirm.restoreForce': 'Не удалось сохранить текущее состояние (мало места). Всё равно восстановить?',

  'sw.unavailable': 'недоступен (откройте по https-адресу)',
  'sw.ready': 'готов, приложение работает без интернета',
  'sw.installing': 'устанавливается…',
  'sw.error': 'ошибка: {msg}',
  'sw.inactive': 'не активен',

  // components
  'empty': 'Пока пусто',
  'plan.week': 'Неделя с {day}',
  'plan.none': 'Без даты',
  'task.deadline': 'дедлайн {day}',
  'move.today': 'Сегодня', 'move.week': 'На неделю', 'move.none': 'Без даты',
  'aria.done': 'Готово',
  'quick.title': 'Быстро добавить',
  'quick.placeholder': 'Одно дело на строку',
  'quick.kind.none': 'Без даты', 'quick.kind.day': 'На день', 'quick.kind.week': 'На неделю',
  'quick.when': 'Когда', 'quick.date': 'Дата',
  'quick.hint': 'Можно вставить сразу несколько строк. Дата необязательна.',

  // today
  'today.review': 'Утренний разбор · {n}',
  'today.reviewHint': 'Ничего не переносится без твоего решения.',
  'today.title': 'Сегодня · {day}',
  'today.week': 'На этой неделе',
  'today.schedule': 'Расписание',
  'today.noEvents': 'Нет событий',

  // calendar
  'cal.add': 'Добавить событие',
  'cal.titlePh': 'Название',
  'cal.when': 'Дата и время',
  'cal.events': 'События',

  // tasks
  'tasks.byDay': 'По дням', 'tasks.byWeek': 'По неделям', 'tasks.none': 'Без даты',

  // projects
  'proj.milestones': 'Этапы · {done}/{n}',
  'proj.newMilestone': 'Новый этап',
  'proj.addMilestone': 'Добавить этап',
  'proj.quantity': 'Количество · {cur}/{total} {unit} ({pct}%)',
  'proj.current': 'Текущее значение',
  'proj.new': 'Новый проект',
  'proj.namePh': 'Название',
  'proj.targetPh': 'Цель',
  'proj.targetAria': 'Цель, число',
  'proj.unitPh': 'Главы, страницы…',
  'proj.empty': 'Проектов пока нет',
  'proj.defaultUnit': 'ед.',

  // lists
  'lists.addItem': 'Добавить пункт',
  'lists.new': 'Новый список',
  'lists.namePh': 'Например, покупки',
  'lists.empty': 'Списков пока нет',

  // data
  'data.save': 'Сохранение',
  'data.readOnly': 'Только чтение: {reason}',
  'data.downloadRaw': 'Скачать исходные данные',
  'data.saveFailed': 'Последнее сохранение не удалось: {reason}.',
  'data.retrySave': 'Повторить сохранение',
  'data.lastSaved': 'Последнее сохранение: {at}',
  'data.noChanges': 'В этом сеансе изменений ещё не было.',
  'data.backup': 'Резервная копия',
  'data.backupInfo': 'Данные хранятся только на этом устройстве. Сохраняй копию в «Файлы» / iCloud Drive хотя бы раз в неделю.',
  'data.lastBackup': 'Последняя копия: {at}',
  'data.noBackup': 'Копий с этого устройства ещё не было.',
  'data.showText': 'Показать текст копии',
  'data.hideText': 'Скрыть текст копии',
  'data.textHint': 'Запасной способ: скопируйте текст и вставьте, например, в Заметки.',
  'data.copyText': 'Скопировать текст',
  'data.restoreTitle': 'Восстановить из копии',
  'data.chooseFile': 'Выбрать файл копии…',
  'data.pasteSummary': 'Или вставить текст копии',
  'data.pastePh': 'Вставьте сюда текст резервной копии',
  'data.check': 'Проверить',
  'data.checked': 'Файл проверен.',
  'data.copyFrom': 'Копия от {at}.',
  'data.contains': 'В нём: {counts}.',
  'data.willQuarantine': '{n} запис(ь/и) не прошли проверку и попадут в карантин (не потеряются).',
  'data.willReplace1': 'Текущие данные будут',
  'data.willReplace2': 'заменены',
  'data.willReplace3': '. Перед заменой сохраняется автокопия текущего состояния.',
  'data.replace': 'Заменить данные',
  'data.snapshots': 'Автокопии',
  'data.snapshotsInfo': 'Ежедневные: одна в день, хранятся последние 5. Для отката: перед обновлением формата данных, импортом и восстановлением, последние 5. Все они лежат на этом же устройстве, поэтому не заменяют экспорт.',
  'data.noSnapshots': 'Автокопий пока нет',
  'data.deleted': 'Удалённые (30 дней)',
  'data.deletedAt': 'удалено {at}',
  'data.nothingDeleted': 'Ничего не удалено',
  'data.quarantine': 'Карантин · {n}',
  'data.quarantineInfo': 'Записи, которые не прошли проверку при загрузке или импорте. Они не показываются, но сохраняются и попадают в каждую резервную копию.',
  'data.quarantineDownload': 'Скачать карантин',
  'data.damaged': 'Повреждённые данные',
  'data.damagedInfo': 'Исходный текст, который не удалось прочитать. Сохранён как есть, чтобы его можно было восстановить вручную.',
  'data.about': 'О приложении',
  'data.version': 'Версия {v} · схема данных {s}',
  'data.standalone': 'Запущено с экрана «Домой»: {yn}',
  'data.offline': 'Офлайн-режим: {state}',
  'data.persist': 'Постоянное хранилище: {state}',
  'data.used': 'Занято: {used}',
  'data.usedOf': 'Занято: {used} из {quota}',
  'yes': 'да', 'no': 'нет',
  'persist.yes': 'разрешено', 'persist.no': 'не разрешено браузером', 'persist.unknown': 'неизвестно',
  'counts': 'задач {tasks}, событий {events}, проектов {projects}, списков {lists}',
  'counts.unreadable': 'не читается',
  'size.b': '{n} Б', 'size.kb': '{n} КБ', 'size.mb': '{n} МБ',
  'snap.daily': 'ежедневная', 'snap.before-import': 'перед импортом', 'snap.before-restore': 'перед восстановлением', 'snap.manual': 'вручную',
  'kind.tasks': 'Задача', 'kind.events': 'Событие', 'kind.projects': 'Проект', 'kind.lists': 'Список',

  // settings
  'set.appearance': 'Оформление',
  'set.light': 'Светлое', 'set.lightHint': 'Мягкий тёплый светлый фон',
  'set.dark': 'Тёмное', 'set.darkHint': 'Приглушённые тёмные цвета',
  'set.system': 'Как в системе', 'set.systemHint': 'Следует светлому или тёмному режиму iPhone (Настройки → Экран и яркость)',
  'set.appearanceNote': 'Выбор хранится только на этом устройстве и не входит в резервные копии. Окна подтверждения («Удалить?» и т. п.) рисует сама iOS — они всегда следуют настройке iPhone.',
  'set.language': 'Язык',
  'set.languageNote': 'Язык выбирается вручную и хранится только на этом устройстве. Введённые вами тексты не переводятся.',

  // store messages
  'notice.snapshotUnreadable': 'Не удалось создать автоматическую копию: хранилище автокопий не читается. Сделайте экспорт во вкладке «Данные».',
  'notice.snapshotNoSpace': 'Не удалось создать автоматическую копию (мало места). Сделайте экспорт во вкладке «Данные».',
  'notice.storageOdd': 'Хранилище повело себя неожиданно при записи. Сделайте экспорт во вкладке «Данные».',
  'notice.trimmedCopies': 'Память почти заполнена: старые автокопии удалены, чтобы сохранить данные. Сделайте экспорт.',
  'notice.trimRestoreFailed': 'Старые автокопии пришлось удалить, чтобы освободить место, и вернуть их не удалось. Сделайте экспорт.',
  'notice.recoveredFromCopy': 'Основные данные не читаются ({reason}). Загружена автоматическая копия от {at}; изменения после неё могли не сохраниться.',
  'notice.recoveredEmpty': 'Основные данные не читаются ({reason}), автоматических копий нет. Начат пустой органайзер — импортируйте последний экспорт во вкладке «Данные».',
  'notice.rescueSaved': 'Исходный повреждённый текст сохранён отдельно: «Данные» → «Повреждённые данные».',
  'notice.legacyDamaged': 'Найдены данные прототипа, но они повреждены. Они оставлены без изменений.',
  'notice.legacyUnreadable': 'Данные прототипа не удалось прочитать ({reason}). Они оставлены без изменений.',
  'notice.legacyMigrated': 'Перенесены данные прототипа: {what}. Старая копия не тронута.{q}',
  'notice.legacyNotSaved': 'Данные прототипа прочитаны ({what}), но сохранить их в новом формате не удалось. Старая копия не тронута; перенос повторится при следующем запуске.{q}',
  'notice.legacyQuarantined': ' {n} записей не прошли проверку и лежат в карантине.',
  'notice.loadQuarantined': '{n} запис(ь/и) не прошли проверку и отложены в карантин («Данные» → «Карантин»). Остальное загружено.',
  'notice.actionFailed': '«{label}» не выполнено: {reason}',
  'notice.actionRejected': '«{label}» отменено: данные не прошли проверку ({reason}). Ничего не изменено.',
  'notice.importFailed': 'Импорт не выполнен: {reason}.',
  'notice.importDone': 'Импорт выполнен. Прежние данные сохранены в автокопиях («Данные» → «Автокопии»).',
  'notice.restoreFailed': 'Восстановление не выполнено: {reason}.',
  'notice.restoreDone': 'Данные восстановлены из автокопии. Состояние до восстановления тоже сохранено в автокопиях.',
  'notice.otherWindowPending': 'Данные изменены в другом окне, но здесь есть несохранённые изменения. Они оставлены как есть: сохраните копию во вкладке «Данные».',
  'ro.rescueFailed': 'не удалось отдельно сохранить повреждённые данные, поэтому запись отключена, чтобы их не перезаписать. Скачайте их во вкладке «Данные».',
  'ro.storageUnavailable': 'хранилище браузера недоступно ({msg}). Ничего не сохраняется.',
  'ro.newer': 'данные записаны более новой версией приложения (схема {v}). Обновите приложение. Запись отключена, чтобы ничего не потерять.',
  'save.quota': 'память браузера заполнена',
  'save.unknown': 'неизвестная ошибка',
  'save.verify': 'запись не подтвердилась при проверке',
  'err.noReadyImport': 'нет проверенных данных для импорта',
  'err.copyNotFound': 'копия не найдена',
  'err.replaceNotSaved': 'новые данные не удалось сохранить ({reason}); текущие данные не изменены',

  // action names and errors
  'act.addTasks': 'Добавить задачи', 'act.setTaskDone': 'Отметить задачу', 'act.moveTask': 'Перенести задачу',
  'act.delete': 'Удалить', 'act.restore': 'Восстановить', 'act.addEvent': 'Добавить событие',
  'act.addProject': 'Создать проект', 'act.addMilestone': 'Добавить этап', 'act.setMilestoneDone': 'Отметить этап',
  'act.quantity': 'Изменить прогресс', 'act.addList': 'Создать список', 'act.addItem': 'Добавить пункт',
  'act.setItemDone': 'Отметить пункт',
  'err.notFound': '{what} не найден(а)',
  'what.task': 'Задача', 'what.project': 'Проект', 'what.milestone': 'Этап', 'what.list': 'Список', 'what.item': 'Пункт',
  'what.event': 'Событие', 'what.record': 'Запись',
  'err.deletedNotFound': 'удалённая запись не найдена',
  'err.unknownCollection': 'неизвестный тип записи',
  'err.unknownPlanKind': 'неизвестный вариант даты',
  'err.needTitle': 'нужно название',
  'err.needDateTime': 'нужны дата и время',
  'err.badTarget': 'цель должна быть числом от 0',
  'err.needMilestoneTitle': 'нужно название этапа',
  'err.needItemTitle': 'нужно название пункта',

  // import
  'imp.notJson': 'Это не корректный JSON-файл.',
  'imp.newer': 'Файл создан более новой версией приложения (схема {v}). Сначала обновите приложение.',
  'imp.notBackup': 'Файл не похож на резервную копию органайзера ({reason}).',
  'imp.readFailed': 'Не удалось прочитать файл: {msg}',

  // validation reasons (also shown for quarantined records)
  'fatal.notObject': 'данные не являются объектом',
  'fatal.notOrganizer': 'не похоже на данные органайзера',
  'fatal.badVersion': 'неизвестная версия данных',
  'fatal.unknownVersion': 'неизвестная версия',
  'fatal.textDamaged': 'текст повреждён',
  'rescue.unreadable': 'не читается {key}',
  'rescue.snapshotsUnreadable': 'автокопии не читаются',
  'rescue.archiveUnreadable': 'архив повреждённых данных не читается',
  'reason.notObject': 'запись не является объектом',
  'reason.badId': 'неверный id',
  'reason.noTitle': 'нет названия',
  'reason.badPlan': 'неверный план (день/неделя/без даты)',
  'reason.badPlanDate': 'неверная дата плана',
  'reason.weekNotMonday': 'неделя должна начинаться с понедельника',
  'reason.badDone': 'неверное поле «готово»',
  'reason.badTaskTime': 'неверное время задачи',
  'reason.badReminder': 'неверное напоминание',
  'reason.badDeadline': 'неверный дедлайн',
  'reason.badProjectLink': 'неверная ссылка на проект',
  'reason.badCompletedAt': 'неверная дата выполнения',
  'reason.badCreatedAt': 'неверная дата создания',
  'reason.badUpdatedAt': 'неверная дата изменения',
  'reason.badDeletedAt': 'неверная дата удаления',
  'reason.badStart': 'нет или неверное время начала',
  'reason.badEnd': 'неверное время окончания',
  'reason.badAllDay': 'неверное поле «весь день»',
  'reason.badRepeat': 'неверное правило повтора',
  'reason.badAlerts': 'неверные оповещения',
  'reason.itemNotObject': 'пункт не является объектом',
  'reason.badItemId': 'неверный id пункта',
  'reason.noItemTitle': 'нет названия пункта',
  'reason.dupItemId': 'повторяющийся id пункта',
  'reason.milestonesNotList': 'этапы не являются списком',
  'reason.badQuantity': 'неверный счётчик прогресса',
  'reason.itemsNotList': 'пункты не являются списком',
  'reason.notList': 'коллекция не является списком',
  'reason.dupId': 'повторяющийся id',
  'reason.badQuarantineEntry': 'неверная запись карантина',
  'reason.badQuarantine': 'неверный формат карантина',

  // personal planning day and onboarding (0.3.0)
  'onb.title': 'Добро пожаловать',
  'onb.intro': 'Два коротких вопроса. Всё можно пропустить и изменить позже в «Настройках».',
  'onb.dayTitle': 'Ваш обычный день',
  'onb.dayIntro': 'До этого времени «Сегодня» показывает текущий день, даже после полуночи. Даты и время событий, дедлайны не меняются.',
  'onb.save': 'Готово',
  'onb.skip': 'Пропустить',
  'onb.skipHint': 'Если пропустить, день заканчивается в полночь, как раньше.',
  'day.title': 'Мой день',
  'day.wake': 'Обычно встаю в',
  'day.bed': 'Обычно ложусь в',
  'day.cutoff': 'День заканчивается в',
  'day.cutoffHint': 'Предлагается время отхода ко сну. Если часто ложитесь позже — поставьте время позже.',
  'day.suggest': 'Взять время отхода ко сну',
  'day.save': 'Сохранить',
  'day.saved': 'Настройки дня сохранены.',
  'day.note': '«Сегодня», задачи и разборы следуют вашему дню. Даты и время событий, дедлайны и отметки времени не меняются.',
  'day.endsAt': 'День заканчивается в {time}',
  'day.calendarNow': 'По календарю: {day}',
  'day.finish': 'Завершить день',
  'day.finishedEarly': 'День «{day}» завершён досрочно.',
  'day.undoFinish': 'Вернуть',
  'confirm.finishDay': 'Завершить «{day}»? «Сегодня» перейдёт на «{next}». Невыполненные задачи этого дня появятся в утреннем разборе. Вернуть можно до {until}.',
  'notice.finishNotSaved': 'Не удалось сохранить завершение дня.',
  'act.setDay': 'Сохранить настройки дня',
  'act.onboarding': 'Сохранить первоначальную настройку',
  'err.badTime': 'неверное время',

  // data preservation and privacy (0.3.0)
  'confirm.dropRollback': 'Хранятся последние 5 копий для отката. Чтобы сохранить текущее состояние, будет удалена самая старая из них (от {at}) — таких данных больше нет ни в одной копии. Если она может понадобиться, нажмите «Отмена» и сначала скачайте её в «Данные» → «Автокопии». Продолжить?',
  'rescue.legacyUnreadable': 'данные прототипа не читаются',
  'rescue.rollbackUnreadable': 'копии для отката не читаются',
  'snap.before-migration': 'перед обновлением формата данных',
  'ro.upgradeFailed': 'новая версия не смогла безопасно прочитать сохранённые данные, поэтому обновление данных остановлено. Ничего не изменено и не удалено. Скачайте исходные данные во вкладке «Данные» и сообщите о проблеме.',
  'ro.upgradeNoCopy': 'не хватило места, чтобы перед обновлением формата сохранить копию прежних данных, поэтому обновление остановлено. Ничего не изменено. Скачайте исходные данные во вкладке «Данные»; после этого можно продолжить обновление без копии.',
  'notice.upgraded': 'Данные переведены в новый формат (версия {from} → {to}). Копия прежних данных сохранена: «Данные» → «Автокопии».',
  'notice.upgradedWithoutCopy': 'Данные переведены в новый формат без копии прежних данных. Сохраните скачанный файл исходных данных.',
  'data.continueUpgrade': 'Продолжить обновление без копии',
  'confirm.continueUpgrade': 'Вы скачали исходные данные кнопкой «Скачать исходные данные»? Обновление продолжится без копии для отката внутри приложения.',
  'data.originOther': 'Эта копия сделана в другом органайзере — на другом устройстве или другим человеком. Если это не ваши данные, не заменяйте ими свои.',
  'data.originUnknown': 'По этой копии нельзя определить, из какого органайзера она (её сделала старая версия). Убедитесь, что это ваши данные.',
  'confirm.importForeign': 'Эта копия из ДРУГОГО органайзера (другое устройство или другой человек). Все текущие данные на этом устройстве будут заменены её содержимым. Точно заменить?',
  'data.privacy': 'Данные хранятся только в этом браузере на этом устройстве и никуда не отправляются. Они привязаны к адресу {address}: по другому адресу приложение их не увидит.'
};

const EN = {
  'app.title': 'My Organizer',
  'app.short': 'Organizer',
  'tab.today': 'Today', 'tab.calendar': 'Calendar', 'tab.tasks': 'Tasks',
  'tab.projects': 'Progress', 'tab.lists': 'Lists', 'tab.data': 'Data', 'tab.settings': 'Settings',

  'status.readOnly': 'Read-only',
  'status.notSaved': '⚠ Not saved',
  'status.saved': 'Saved {time}',
  'status.idle': 'Version {v} · data only on this device',

  'banner.readOnly': 'Read-only.',
  'banner.saveFailed': 'Could not save:',
  'banner.saveFailedTail': 'The latest changes exist only in memory for now — save a backup.',
  'banner.update': 'A new version of the app is available.',
  'banner.safari': 'Opened in Safari. Safari and the Home Screen icon keep separate data — install the app and use only the icon.',
  'btn.retry': 'Retry', 'btn.saveBackup': 'Save backup', 'btn.update': 'Update',
  'btn.hide': 'Hide', 'btn.delete': 'Delete', 'btn.add': 'Add', 'btn.create': 'Create',
  'btn.restore': 'Restore', 'btn.download': 'Download', 'btn.cancel': 'Cancel',

  'backup.none': 'No backup from this device yet.',
  'backup.daysAgo': 'Last backup: {days} {days|day|days} ago.',

  'render.errorTitle': 'Display error',
  'render.errorText': 'No data was lost. Save a backup and report the error.',

  'notice.copied': 'Backup text copied. Paste it into Notes, for example.',
  'notice.copyFailed': 'Could not copy automatically: the text is selected, copy it by hand.',
  'notice.genericError': 'Error: {msg}',
  'notice.otherWindow': 'Data was changed in another window — showing the current data.',
  'notice.appearanceNotSaved': 'Could not save the appearance choice — it applies until the app is closed.',
  'notice.languageNotSaved': 'Could not save the language choice — it applies until the app is closed.',
  'notice.restoreFailedShort': 'Could not restore: {reason}',

  'confirm.delete': 'Delete? You can restore it in the “Data” tab within 30 days.',
  'confirm.import': 'Replace all current data with the data from the backup?',
  'confirm.importForce': 'Could not make an automatic copy of the current data (not enough space). Unless you saved a backup yourself, the current data will be lost. Replace anyway?',
  'confirm.restore': 'Restore data from this automatic copy? The current state will also be kept in automatic copies.',
  'confirm.restoreForce': 'Could not save the current state (not enough space). Restore anyway?',

  'sw.unavailable': 'unavailable (open the https address)',
  'sw.ready': 'ready, the app works without internet',
  'sw.installing': 'installing…',
  'sw.error': 'error: {msg}',
  'sw.inactive': 'not active',

  'empty': 'Nothing yet',
  'plan.week': 'Week of {day}',
  'plan.none': 'No date',
  'task.deadline': 'deadline {day}',
  'move.today': 'Today', 'move.week': 'This week', 'move.none': 'No date',
  'aria.done': 'Done',
  'quick.title': 'Quick add',
  'quick.placeholder': 'One task per line',
  'quick.kind.none': 'No date', 'quick.kind.day': 'For a day', 'quick.kind.week': 'For a week',
  'quick.when': 'When', 'quick.date': 'Date',
  'quick.hint': 'You can paste several lines at once. The date is optional.',

  'today.review': 'Morning review · {n}',
  'today.reviewHint': 'Nothing moves without your decision.',
  'today.title': 'Today · {day}',
  'today.week': 'This week',
  'today.schedule': 'Schedule',
  'today.noEvents': 'No events',

  'cal.add': 'Add event',
  'cal.titlePh': 'Title',
  'cal.when': 'Date and time',
  'cal.events': 'Events',

  'tasks.byDay': 'By day', 'tasks.byWeek': 'By week', 'tasks.none': 'No date',

  'proj.milestones': 'Milestones · {done}/{n}',
  'proj.newMilestone': 'New milestone',
  'proj.addMilestone': 'Add milestone',
  'proj.quantity': 'Amount · {cur}/{total} {unit} ({pct}%)',
  'proj.current': 'Current value',
  'proj.new': 'New project',
  'proj.namePh': 'Name',
  'proj.targetPh': 'Target',
  'proj.targetAria': 'Target, a number',
  'proj.unitPh': 'Chapters, pages…',
  'proj.empty': 'No projects yet',
  'proj.defaultUnit': 'units',

  'lists.addItem': 'Add item',
  'lists.new': 'New list',
  'lists.namePh': 'For example, groceries',
  'lists.empty': 'No lists yet',

  'data.save': 'Saving',
  'data.readOnly': 'Read-only: {reason}',
  'data.downloadRaw': 'Download the original data',
  'data.saveFailed': 'The last save failed: {reason}.',
  'data.retrySave': 'Retry saving',
  'data.lastSaved': 'Last saved: {at}',
  'data.noChanges': 'No changes in this session yet.',
  'data.backup': 'Backup',
  'data.backupInfo': 'Data is stored only on this device. Save a backup to Files / iCloud Drive at least once a week.',
  'data.lastBackup': 'Last backup: {at}',
  'data.noBackup': 'No backups from this device yet.',
  'data.showText': 'Show backup text',
  'data.hideText': 'Hide backup text',
  'data.textHint': 'Fallback: copy the text and paste it, for example, into Notes.',
  'data.copyText': 'Copy text',
  'data.restoreTitle': 'Restore from a backup',
  'data.chooseFile': 'Choose a backup file…',
  'data.pasteSummary': 'Or paste the backup text',
  'data.pastePh': 'Paste the backup text here',
  'data.check': 'Check',
  'data.checked': 'File checked.',
  'data.copyFrom': 'Backup from {at}.',
  'data.contains': 'It contains: {counts}.',
  'data.willQuarantine': '{n} {n|record|records} did not pass the check and will go to quarantine (nothing is lost).',
  'data.willReplace1': 'The current data will be',
  'data.willReplace2': 'replaced',
  'data.willReplace3': '. An automatic copy of the current state is saved first.',
  'data.replace': 'Replace data',
  'data.snapshots': 'Automatic copies',
  'data.snapshotsInfo': 'Daily: one a day, the latest 5 are kept. For rollback: before a data-format upgrade, an import or a restore, the latest 5. All of them are on this same device, so they do not replace exports.',
  'data.noSnapshots': 'No automatic copies yet',
  'data.deleted': 'Deleted (30 days)',
  'data.deletedAt': 'deleted {at}',
  'data.nothingDeleted': 'Nothing deleted',
  'data.quarantine': 'Quarantine · {n}',
  'data.quarantineInfo': 'Records that did not pass the check when loading or importing. They are not shown, but they are kept and included in every backup.',
  'data.quarantineDownload': 'Download quarantine',
  'data.damaged': 'Damaged data',
  'data.damagedInfo': 'Original text that could not be read. It is kept unchanged so it can be recovered by hand.',
  'data.about': 'About the app',
  'data.version': 'Version {v} · data schema {s}',
  'data.standalone': 'Started from the Home Screen: {yn}',
  'data.offline': 'Offline mode: {state}',
  'data.persist': 'Persistent storage: {state}',
  'data.used': 'Used: {used}',
  'data.usedOf': 'Used: {used} of {quota}',
  'yes': 'yes', 'no': 'no',
  'persist.yes': 'granted', 'persist.no': 'not granted by the browser', 'persist.unknown': 'unknown',
  'counts': 'tasks {tasks}, events {events}, projects {projects}, lists {lists}',
  'counts.unreadable': 'unreadable',
  'size.b': '{n} B', 'size.kb': '{n} KB', 'size.mb': '{n} MB',
  'snap.daily': 'daily', 'snap.before-import': 'before import', 'snap.before-restore': 'before restore', 'snap.manual': 'manual',
  'kind.tasks': 'Task', 'kind.events': 'Event', 'kind.projects': 'Project', 'kind.lists': 'List',

  'set.appearance': 'Appearance',
  'set.light': 'Light', 'set.lightHint': 'Soft warm light background',
  'set.dark': 'Dark', 'set.darkHint': 'Muted dark colours',
  'set.system': 'Match system', 'set.systemHint': 'Follows the iPhone’s light or dark mode (Settings → Display & Brightness)',
  'set.appearanceNote': 'The choice is stored only on this device and is not part of backups. Confirmation dialogs (“Delete?” etc.) are drawn by iOS and always follow the iPhone’s setting.',
  'set.language': 'Language',
  'set.languageNote': 'The language is chosen by hand and stored only on this device. Text you typed is not translated.',

  'notice.snapshotUnreadable': 'Could not make an automatic copy: the automatic-copies area cannot be read. Save a backup in the “Data” tab.',
  'notice.snapshotNoSpace': 'Could not make an automatic copy (not enough space). Save a backup in the “Data” tab.',
  'notice.storageOdd': 'Storage behaved unexpectedly while saving. Save a backup in the “Data” tab.',
  'notice.trimmedCopies': 'Storage is almost full: old automatic copies were removed to save the data. Save a backup.',
  'notice.trimRestoreFailed': 'Old automatic copies had to be removed to free space and could not be put back. Save a backup.',
  'notice.recoveredFromCopy': 'The main data cannot be read ({reason}). The automatic copy from {at} was loaded; changes after it may be missing.',
  'notice.recoveredEmpty': 'The main data cannot be read ({reason}) and there are no automatic copies. An empty organizer was started — import your latest backup in the “Data” tab.',
  'notice.rescueSaved': 'The original damaged text was kept separately: “Data” → “Damaged data”.',
  'notice.legacyDamaged': 'Prototype data was found but it is damaged. It was left unchanged.',
  'notice.legacyUnreadable': 'Prototype data could not be read ({reason}). It was left unchanged.',
  'notice.legacyMigrated': 'Prototype data was moved: {what}. The old copy was not touched.{q}',
  'notice.legacyNotSaved': 'Prototype data was read ({what}) but could not be saved in the new format. The old copy was not touched; the move will be repeated on the next start.{q}',
  'notice.legacyQuarantined': ' {n} {n|record|records} did not pass the check and are in quarantine.',
  'notice.loadQuarantined': '{n} {n|record|records} did not pass the check and went to quarantine (“Data” → “Quarantine”). Everything else was loaded.',
  'notice.actionFailed': '“{label}” was not done: {reason}',
  'notice.actionRejected': '“{label}” was cancelled: the data did not pass the check ({reason}). Nothing was changed.',
  'notice.importFailed': 'Import was not done: {reason}.',
  'notice.importDone': 'Import done. The previous data was kept in automatic copies (“Data” → “Automatic copies”).',
  'notice.restoreFailed': 'Restore was not done: {reason}.',
  'notice.restoreDone': 'Data was restored from the automatic copy. The state before restoring was also kept in automatic copies.',
  'notice.otherWindowPending': 'Data was changed in another window, but this window has unsaved changes. They were kept as they are: save a backup in the “Data” tab.',
  'ro.rescueFailed': 'the damaged data could not be kept separately, so writing is switched off to avoid overwriting it. Download it in the “Data” tab.',
  'ro.storageUnavailable': 'browser storage is unavailable ({msg}). Nothing is saved.',
  'ro.newer': 'the data was written by a newer version of the app (schema {v}). Update the app. Writing is switched off so that nothing is lost.',
  'save.quota': 'browser storage is full',
  'save.unknown': 'unknown error',
  'save.verify': 'the write could not be confirmed',
  'err.noReadyImport': 'there is no checked data to import',
  'err.copyNotFound': 'copy not found',
  'err.replaceNotSaved': 'the new data could not be saved ({reason}); the current data was not changed',

  'act.addTasks': 'Add tasks', 'act.setTaskDone': 'Mark task', 'act.moveTask': 'Move task',
  'act.delete': 'Delete', 'act.restore': 'Restore', 'act.addEvent': 'Add event',
  'act.addProject': 'Create project', 'act.addMilestone': 'Add milestone', 'act.setMilestoneDone': 'Mark milestone',
  'act.quantity': 'Change progress', 'act.addList': 'Create list', 'act.addItem': 'Add item',
  'act.setItemDone': 'Mark item',
  'err.notFound': '{what} not found',
  'what.task': 'Task', 'what.project': 'Project', 'what.milestone': 'Milestone', 'what.list': 'List', 'what.item': 'Item',
  'what.event': 'Event', 'what.record': 'Record',
  'err.deletedNotFound': 'deleted record not found',
  'err.unknownCollection': 'unknown record type',
  'err.unknownPlanKind': 'unknown date option',
  'err.needTitle': 'a title is needed',
  'err.needDateTime': 'a date and time are needed',
  'err.badTarget': 'the target must be a number from 0',
  'err.needMilestoneTitle': 'a milestone title is needed',
  'err.needItemTitle': 'an item title is needed',

  'imp.notJson': 'This is not a valid JSON file.',
  'imp.newer': 'The file was made by a newer version of the app (schema {v}). Update the app first.',
  'imp.notBackup': 'The file does not look like an organizer backup ({reason}).',
  'imp.readFailed': 'Could not read the file: {msg}',

  'fatal.notObject': 'the data is not an object',
  'fatal.notOrganizer': 'does not look like organizer data',
  'fatal.badVersion': 'unknown data version',
  'fatal.unknownVersion': 'unknown version',
  'fatal.textDamaged': 'text is damaged',
  'rescue.unreadable': '{key} cannot be read',
  'rescue.snapshotsUnreadable': 'automatic copies cannot be read',
  'rescue.archiveUnreadable': 'the damaged-data archive cannot be read',
  'reason.notObject': 'the record is not an object',
  'reason.badId': 'invalid id',
  'reason.noTitle': 'no title',
  'reason.badPlan': 'invalid plan (day/week/no date)',
  'reason.badPlanDate': 'invalid planned date',
  'reason.weekNotMonday': 'a week must start on Monday',
  'reason.badDone': 'invalid “done” field',
  'reason.badTaskTime': 'invalid task time',
  'reason.badReminder': 'invalid reminder',
  'reason.badDeadline': 'invalid deadline',
  'reason.badProjectLink': 'invalid project link',
  'reason.badCompletedAt': 'invalid completion date',
  'reason.badCreatedAt': 'invalid creation date',
  'reason.badUpdatedAt': 'invalid change date',
  'reason.badDeletedAt': 'invalid deletion date',
  'reason.badStart': 'missing or invalid start time',
  'reason.badEnd': 'invalid end time',
  'reason.badAllDay': 'invalid “all day” field',
  'reason.badRepeat': 'invalid repeat rule',
  'reason.badAlerts': 'invalid alerts',
  'reason.itemNotObject': 'the item is not an object',
  'reason.badItemId': 'invalid item id',
  'reason.noItemTitle': 'the item has no title',
  'reason.dupItemId': 'duplicate item id',
  'reason.milestonesNotList': 'milestones are not a list',
  'reason.badQuantity': 'invalid progress counter',
  'reason.itemsNotList': 'items are not a list',
  'reason.notList': 'the collection is not a list',
  'reason.dupId': 'duplicate id',
  'reason.badQuarantineEntry': 'invalid quarantine entry',
  'reason.badQuarantine': 'invalid quarantine format',

  'onb.title': 'Welcome',
  'onb.intro': 'Two short questions. You can skip everything and change it later in “Settings”.',
  'onb.dayTitle': 'Your usual day',
  'onb.dayIntro': 'Until this time “Today” keeps showing the current day, even after midnight. Event dates and times and deadlines do not change.',
  'onb.save': 'Done',
  'onb.skip': 'Skip',
  'onb.skipHint': 'If you skip, the day ends at midnight, as before.',
  'day.title': 'My day',
  'day.wake': 'I usually get up at',
  'day.bed': 'I usually go to bed at',
  'day.cutoff': 'The day ends at',
  'day.cutoffHint': 'Your bedtime is suggested. If you often go to bed later, set a later time.',
  'day.suggest': 'Use my bedtime',
  'day.save': 'Save',
  'day.saved': 'Day settings saved.',
  'day.note': '“Today”, tasks and reviews follow your day. Event dates and times, deadlines and timestamps do not change.',
  'day.endsAt': 'The day ends at {time}',
  'day.calendarNow': 'Calendar date: {day}',
  'day.finish': 'Finish day',
  'day.finishedEarly': 'The day “{day}” was finished early.',
  'day.undoFinish': 'Undo',
  'confirm.finishDay': 'Finish “{day}”? “Today” will move to “{next}”. This day’s unfinished tasks will appear in the morning review. You can undo this until {until}.',
  'notice.finishNotSaved': 'Could not save finishing the day.',
  'act.setDay': 'Save day settings',
  'act.onboarding': 'Save first-launch settings',
  'err.badTime': 'invalid time',

  // data preservation and privacy (0.3.0)
  'confirm.dropRollback': 'The latest 5 rollback copies are kept. To keep the current state, the oldest of them (from {at}) will be removed — its data is not in any other copy. If you might need it, tap “Cancel” and first download it in “Data” → “Automatic copies”. Continue?',
  'rescue.legacyUnreadable': 'the prototype data cannot be read',
  'rescue.rollbackUnreadable': 'rollback copies cannot be read',
  'snap.before-migration': 'before data-format upgrade',
  'ro.upgradeFailed': 'the new version could not read the saved data safely, so the data upgrade was stopped. Nothing was changed or deleted. Download the original data in the “Data” tab and report the problem.',
  'ro.upgradeNoCopy': 'there was not enough space to keep a copy of the previous data before upgrading its format, so the upgrade was stopped. Nothing was changed. Download the original data in the “Data” tab; after that you can continue the upgrade without the copy.',
  'notice.upgraded': 'Your data was moved to the new format (version {from} → {to}). A copy of the previous data is kept in “Data” → “Automatic copies”.',
  'notice.upgradedWithoutCopy': 'Your data was moved to the new format without a copy of the previous data. Keep the downloaded file with the original data.',
  'data.continueUpgrade': 'Continue the upgrade without a copy',
  'confirm.continueUpgrade': 'Have you downloaded the original data with “Download the original data”? The upgrade will continue without a rollback copy inside the app.',
  'data.originOther': 'This backup was made by a different organizer — on another device or by another person. If this is not your data, do not replace yours with it.',
  'data.originUnknown': 'This backup does not say which organizer it comes from (an older version made it). Make sure it is your data.',
  'confirm.importForeign': 'This backup comes from a DIFFERENT organizer (another device or another person). All current data on this device will be replaced with its contents. Replace anyway?',
  'data.privacy': 'Your data is stored only in this browser on this device and is not sent anywhere. It belongs to the address {address}: at any other address the app will not see it.'
};

export const DICTS = { ru: RU, en: EN };

// Extra texts added by later modules (planning day, onboarding) register here.
export function addTexts(ru, en) { Object.assign(RU, ru); Object.assign(EN, en); }

export function has(key) { return typeof key === 'string' && Object.prototype.hasOwnProperty.call(DICTS[lang], key); }

function resolveParam(v) {
  if (v && typeof v === 'object') {
    if ('$t' in v) return t(v.$t, v.params);
    if ('$stamp' in v) return formatStamp(v.$stamp);
    if ('$day' in v) return formatDay(v.$day);
    if ('$dt' in v) return formatDateTime(v.$dt);
    if ('$counts' in v) return v.$counts ? t('counts', v.$counts) : t('counts.unreadable');
    if ('key' in v) return msg(v);
  }
  return v == null ? '' : String(v);
}

export function t(key, params = {}) {
  const dict = DICTS[lang];
  // Own keys only: a text such as 'constructor' from an imported file is shown as it is.
  const s = typeof key === 'string' && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : undefined;
  if (s === undefined) {
    // Plain text (e.g. a reason saved by an older version) is shown as it is.
    if (typeof key === 'string' && /^[a-z]+(\.[A-Za-z0-9_-]+)+$/.test(key)) missing.add(`${lang}:${key}`);
    return typeof key === 'string' ? key : '';
  }
  return s.replace(/\{(\w+)(\|[^}]*)?\}/g, (_, name, forms) => {
    const v = params ? params[name] : undefined;
    if (forms) {
      const list = forms.slice(1).split('|');
      return list[Math.min(pluralIndex(v), list.length - 1)] ?? '';
    }
    return resolveParam(v);
  });
}

// Message from a key, a { key, params } object, or plain text.
export function msg(x) {
  if (x == null || x === '') return '';
  if (typeof x === 'string') return t(x);
  if (typeof x === 'object' && 'key' in x) return t(x.key, x.params || {});
  return String(x);
}

// A message object, used by store/actions/backup instead of finished sentences.
export const m = (key, params) => (params ? { key, params } : { key });

// An Error that carries a message key; its .message is the key.
export function appError(key, params) {
  const e = new Error(key);
  e.key = key;
  e.params = params;
  return e;
}

export function sizeText(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return t('size.b', { n: bytes });
  if (bytes < 1024 * 1024) return t('size.kb', { n: Math.round(bytes / 1024) });
  return t('size.mb', { n: (bytes / 1048576).toFixed(1) });
}
