// Interface texts added in 0.4.0 (calendar, reviews, evening, waiting, templates,
// recurring tasks, editing). Plain data: i18n.js merges these into its two
// dictionaries, so t('key') finds them. Same rules as i18n.js: both languages
// have exactly the same keys and {placeholders} (a unit test checks it).

export const RU4 = {
  // --- reasons for rejected or quarantined records
  'reason.badReview': 'неверная отметка разбора', 'reason.badSeriesLink': 'неверная ссылка на повторяющуюся задачу',
  'reason.badOccurrence': 'неверная дата повтора', 'reason.badSkipped': 'неверная отметка «пропущено»', 'reason.badDoneDay': 'неверный день выполнения',
  'reason.badCategory': 'неверная категория пункта', 'reason.badCategories': 'неверный список категорий',
  'reason.badTemplateBase': 'неверная основа шаблона', 'reason.badFrom': 'неверное поле «от кого»',
  'reason.badFollowUp': 'неверная дата напоминания', 'reason.badNote': 'неверная заметка',
  'reason.badResolved': 'неверная отметка «решено»', 'reason.badFreq': 'неверный тип повтора',
  'reason.badInterval': 'неверный интервал повтора', 'reason.badMode': 'неверный режим повтора',
  'reason.badStartDate': 'неверная дата начала', 'reason.badPaused': 'неверная отметка паузы',
  'reason.badGenerated': 'неверная дата создания повторов',

  // --- action names (shown when an action fails) and record kinds
  'act.editTask': 'Изменить задачу', 'act.reviewTask': 'Разобрать задачу', 'act.reviewAll': 'Перенести всё на завтра',
  'act.editEvent': 'Изменить событие', 'act.addWaiting': 'Добавить ожидание', 'act.editWaiting': 'Изменить ожидание',
  'act.waiting': 'Изменить ожидание', 'act.editList': 'Изменить список', 'act.template': 'Изменить шаблон',
  'act.fromTemplate': 'Создать список из шаблона', 'act.series': 'Изменить повторяющуюся задачу',
  'act.settings': 'Сохранить настройки', 'act.confirmOccurrence': 'Подтвердить повтор',
  'what.waiting': 'Ожидание', 'what.template': 'Шаблон', 'what.series': 'Повторяющаяся задача',

  // --- editing and quick entry
  'err.needDate': 'нужна дата', 'err.badDate': 'неверная дата', 'err.badEnd': 'конец раньше начала',
  'btn.save': 'Сохранить', 'btn.edit': 'Изменить', 'btn.close': 'Закрыть', 'btn.back': 'Назад',
  'edit.title': 'Название', 'edit.when': 'Когда', 'edit.date': 'Дата', 'edit.time': 'Время (необязательно)',
  'edit.deadline': 'Дедлайн (необязательно)', 'edit.deadlineNote': 'Дедлайн не меняется, когда вы переносите задачу.',
  'edit.start': 'Начало', 'edit.end': 'Конец (необязательно)',
  'aria.edit': 'Изменить',
  'quick.askTitle': 'Указано время: «{title}» — {when}',
  'quick.askHint': 'Это задача на это время или событие в календаре?',
  'quick.asTask': 'Задача', 'quick.asEvent': 'Событие', 'quick.asText': 'Только название', 'quick.askCancel': 'Отмена',
  'quick.added': 'Добавлено: «{title}» — {when}', 'quick.addedMany': 'Добавлено задач: {n}. Например: «{title}» — {when}',
  'quick.hint2': 'Понимает даты на русском и английском: «завтра в 15:30», «до пятницы», «15 октября», «in 2 weeks». Одно дело на строку.',
  'quick.eventAdded': 'Событие добавлено: «{title}» — {when}',

  // --- counts in previews of data
  'counts.series': 'повторяющихся {n}', 'counts.waiting': 'ожиданий {n}', 'counts.templates': 'шаблонов {n}',
  'err.unknownReview': 'неизвестное решение', 'err.badFreq': 'неверный тип повтора', 'err.badInterval': 'интервал — целое число от 1 до 999', 'err.badMode': 'неверный режим повтора',
  // --- reviews (morning and evening)
  'review.tomorrow': 'На завтра', 'review.week': 'На эту неделю', 'review.none': 'Без даты', 'review.keep': 'Оставить как есть',
  'review.done': 'Готово', 'review.otherDate': 'Другая дата…', 'review.moveToDate': 'Перенести',
  'review.morningTitle': 'Утренний разбор · {n}',
  'review.morningHint': 'Ничего не переносится без вашего решения. Дедлайны не меняются.',
  'review.quietTitle': 'Уже разобрано · {n}',
  'review.quietHint': 'Эти дела остались невыполненными. Вы уже решили, что с ними делать, — повторно не спрашиваем, но они на виду.',
  'review.decidedKept': 'оставлено', 'review.decidedKeptEvening': 'оставлено вчера вечером',
  'review.allToTomorrow': 'Всё на завтра',
  'confirm.allToTomorrow': 'Перенести на завтра все показанные дела ({n})? Дедлайны не изменятся.',
  'review.nothing': 'Незавершённых дел нет.',
  'review.edit': 'Изменить',

  // --- unconfirmed repeats
  'unconf.title': 'Повторы без подтверждения · {n}',
  'unconf.hint': 'Приложение не знает, что было сделано, пока оно было закрыто, и ничего не отмечает само. Скажите, что произошло.',
  'unconf.done': 'Сделано', 'unconf.doneThen': 'Сделано в тот день', 'unconf.skip': 'Пропустить', 'unconf.today': 'На сегодня',
  'unconf.planned': 'по плану {day}',

  // --- evening screen
  'evening.open': 'Вечер: итоги и завтра',
  'evening.title': 'Вечер · {day}',
  'evening.reviewTitle': 'Незавершённое · {n}',
  'evening.tomorrowTitle': 'Завтра · {day}',
  'evening.events': 'События', 'evening.tasks': 'Задачи на завтра', 'evening.week': 'Задачи недели',
  'evening.repeats': 'Повторы завтра', 'evening.deadlines': 'Ближайшие дедлайны', 'evening.waiting': 'Пора напомнить',
  'evening.nothing': 'На завтра ничего не запланировано.',
  'evening.addTomorrow': 'Добавить на завтра',
  'evening.addPh': 'Что сделать завтра', 'evening.close': 'Закрыть вечерний обзор',
  'evening.note': 'Вечерний обзор открывается только когда приложение открыто: на iPhone приложение не может само показать уведомление, пока закрыто. Его всегда можно открыть вручную кнопкой «Вечер».',
  'evening.deadlineOn': 'дедлайн {day}',

  // --- move buttons
  'move.tomorrow': 'Завтра', 'move.date': 'Другая дата…',

  // --- settings: evening
  'evening.settingsTitle': 'Вечерний обзор',
  'evening.enable': 'Предлагать вечерний обзор',
  'evening.time': 'Время обзора',
  'evening.settingsNote': 'Обзор откроется, когда вы запустите приложение после этого времени (по вашему дню), один раз за вечер. Приложение не присылает уведомлений, пока закрыто.',
  'evening.saved': 'Настройки обзора сохранены.',

  // --- waiting for others
  'wait.title': 'Ожидаю от других',
  'wait.hint': 'Что вы ждёте от других. Это не задачи: они не просрочиваются.',
  'wait.what': 'Чего жду', 'wait.from': 'От кого (необязательно)', 'wait.followUp': 'Напомнить мне (необязательно)',
  'wait.empty': 'Ничего не жду.',
  'wait.since': 'с {day}', 'wait.fromWho': 'от {who}', 'wait.followUpOn': 'напомнить {day}',
  'wait.resolve': 'Решено', 'wait.toTask': 'Нужно действие', 'wait.reopen': 'Вернуть в ожидание',
  'wait.resolvedTitle': 'Решено · {n}', 'wait.note': 'Заметка (необязательно)',
  'wait.dueTitle': 'Пора напомнить · {n}',
  'wait.checkAgain': 'Напомнил(а) — проверить через {n} {n|день|дня|дней}', 'wait.snooze': 'Отложить до…',
  'wait.snoozeTo': 'Отложить',
  'wait.convertedHint': 'превращено в задачу',

  // --- recurring tasks
  'recur.title': 'Повторяющиеся задачи',
  'recur.hint': 'Новая задача появляется сама. Если приложение было закрыто, пропущенное не считается невыполненным — вы подтвердите это вручную.',
  'recur.name': 'Что повторять', 'recur.every': 'Каждые', 'recur.start': 'Начиная с',
  'recur.freq.daily': 'дней', 'recur.freq.weekly': 'недель', 'recur.freq.monthly': 'месяцев', 'recur.freq.yearly': 'лет',
  'recur.mode': 'Считать',
  'recur.mode.completion': 'от дня выполнения', 'recur.mode.fixed': 'по расписанию',
  'recur.modeHint.completion': 'Следующий раз — через интервал после того дня, когда вы отметили задачу.',
  'recur.modeHint.fixed': 'Даты идут по календарю от даты начала, независимо от того, когда вы выполнили.',
  'recur.add': 'Добавить повтор', 'recur.empty': 'Повторяющихся задач нет.',
  'recur.rule.daily.1': 'каждый день', 'recur.rule.daily.n': 'каждые {n} {n|день|дня|дней}',
  'recur.rule.weekly.1': 'каждую неделю', 'recur.rule.weekly.n': 'каждые {n} {n|неделю|недели|недель}',
  'recur.rule.monthly.1': 'каждый месяц', 'recur.rule.monthly.n': 'каждые {n} {n|месяц|месяца|месяцев}',
  'recur.rule.yearly.1': 'каждый год', 'recur.rule.yearly.n': 'каждые {n} {n|год|года|лет}',
  'recur.ruleLine': '{rule}, {mode}',
  'recur.next': 'сейчас: {day}', 'recur.paused': 'на паузе',
  'recur.pause': 'Пауза', 'recur.resume': 'Продолжить',
  'recur.history': 'История', 'recur.historyEmpty': 'Пока пусто',
  'recur.h.done': 'сделано', 'recur.h.skipped': 'пропущено вами', 'recur.h.open': 'ждёт',
  'recur.applyOpen': 'Применить и к текущей задаче',
  'recur.badge': 'повтор',
  'recur.capped': 'Накопилось больше {n} повторов; созданы только последние {n}. Более ранние даты не создавались.',
  'recur.created': 'Созданы повторы без подтверждения: {n}. Откройте «Сегодня», чтобы их разобрать.',
  // --- lists and templates
  'lists.fromTemplate': 'Новый список из шаблона',
  'lists.useTemplate': 'Создать список «{name}»',
  'lists.templates': 'Шаблоны', 'lists.templatesHint': 'Шаблон — заготовка списка без отметок. Новый список из шаблона всегда начинается с чистых пунктов, а сам шаблон не меняется.',
  'lists.newTemplate': 'Новый шаблон', 'lists.templateNamePh': 'Название шаблона',
  'lists.editTemplate': 'Изменить шаблон', 'lists.saveAsTemplate': 'Сохранить как шаблон',
  'lists.builtin': 'стандартный', 'lists.restoreBuiltin': 'Вернуть стандартные шаблоны',
  'lists.restoreHint': 'Стандартные шаблоны, которые вы удалили, добавятся как новые; ваши шаблоны не изменятся.',
  'lists.itemPh': 'Пункт', 'lists.categoryPh': 'Категория (необязательно)',
  'lists.addCategory': 'Новая категория', 'lists.categoryNamePh': 'Название категории',
  'lists.renameCategory': 'Переименовать', 'lists.removeCategory': 'Убрать категорию',
  'confirm.removeCategory': 'Убрать категорию «{name}»? Пункты не удаляются — они станут без категории.',
  'lists.noCategory': 'Без категории', 'lists.rename': 'Название',
  'lists.created': 'Список «{name}» создан из шаблона.',
  'lists.templateSaved': 'Шаблон «{name}» сохранён.',
  'lists.noTemplates': 'Шаблонов нет.', 'lists.done': 'Готово', 'lists.close': 'Закрыть шаблон',
  'lists.itemsCount': '{n} {n|пункт|пункта|пунктов}',
  // --- calendar
  'cal.prev': 'Предыдущий месяц', 'cal.next': 'Следующий месяц', 'cal.prevYear': 'Предыдущий год', 'cal.nextYear': 'Следующий год',
  'cal.todayBtn': 'Сегодня', 'cal.yearView': 'Год', 'cal.monthView': 'Месяц', 'cal.pick': 'Выбрать месяц и год',
  'cal.month': 'Месяц', 'cal.year': 'Год', 'cal.go': 'Перейти',
  'cal.dayTitle': '{day}', 'cal.isToday': 'сегодня по календарю', 'cal.isPlanning': 'ваш плановый день',
  'cal.tasks': 'Задачи', 'cal.events2': 'События', 'cal.deadlines': 'Дедлайны в этот день', 'cal.weekTasks': 'Задачи этой недели · {n}',
  'cal.repeats': 'Повторы',
  'cal.noItems': 'На этот день ничего нет.',
  'cal.addTo': 'Добавить на {day}', 'cal.addTitlePh': 'Название', 'cal.addTime': 'Время (необязательно)',
  'cal.asTask': 'Добавить задачу', 'cal.asEvent': 'Добавить событие', 'cal.needTime': 'Для события укажите время.',
  'cal.aria': '{day}: {parts}', 'cal.ariaNothing': 'ничего',
  'cal.nTasks': '{n} {n|задача|задачи|задач}', 'cal.nDone': 'сделано {n}', 'cal.nEvents': '{n} {n|событие|события|событий}', 'cal.nDeadlines': '{n} {n|дедлайн|дедлайна|дедлайнов}',
  'cal.legend': '● событие  ■ задача  ◆ дедлайн',
  'cal.eventAdded': 'Событие добавлено на {day}.', 'cal.taskAdded': 'Задача добавлена на {day}.'
};

export const EN4 = {
  'reason.badReview': 'invalid review mark', 'reason.badSeriesLink': 'invalid link to a recurring task',
  'reason.badOccurrence': 'invalid repeat date', 'reason.badSkipped': 'invalid “skipped” mark', 'reason.badDoneDay': 'invalid completion day',
  'reason.badCategory': 'invalid item category', 'reason.badCategories': 'invalid category list',
  'reason.badTemplateBase': 'invalid template base', 'reason.badFrom': 'invalid “from whom” field',
  'reason.badFollowUp': 'invalid reminder date', 'reason.badNote': 'invalid note',
  'reason.badResolved': 'invalid “resolved” mark', 'reason.badFreq': 'invalid repeat type',
  'reason.badInterval': 'invalid repeat interval', 'reason.badMode': 'invalid repeat mode',
  'reason.badStartDate': 'invalid start date', 'reason.badPaused': 'invalid pause mark',
  'reason.badGenerated': 'invalid repeat creation date',

  'act.editTask': 'Edit task', 'act.reviewTask': 'Review task', 'act.reviewAll': 'Move everything to tomorrow',
  'act.editEvent': 'Edit event', 'act.addWaiting': 'Add waiting item', 'act.editWaiting': 'Edit waiting item',
  'act.waiting': 'Change waiting item', 'act.editList': 'Edit list', 'act.template': 'Edit template',
  'act.fromTemplate': 'Create list from template', 'act.series': 'Change recurring task',
  'act.settings': 'Save settings', 'act.confirmOccurrence': 'Confirm repeat',
  'what.waiting': 'Waiting item', 'what.template': 'Template', 'what.series': 'Recurring task',

  'err.needDate': 'a date is needed', 'err.badDate': 'invalid date', 'err.badEnd': 'the end is before the start',
  'btn.save': 'Save', 'btn.edit': 'Edit', 'btn.close': 'Close', 'btn.back': 'Back',
  'edit.title': 'Title', 'edit.when': 'When', 'edit.date': 'Date', 'edit.time': 'Time (optional)',
  'edit.deadline': 'Deadline (optional)', 'edit.deadlineNote': 'The deadline does not change when you move the task.',
  'edit.start': 'Start', 'edit.end': 'End (optional)',
  'aria.edit': 'Edit',
  'quick.askTitle': 'Time given: “{title}” — {when}',
  'quick.askHint': 'Is this a task at this time, or an event in the calendar?',
  'quick.asTask': 'Task', 'quick.asEvent': 'Event', 'quick.asText': 'Title only', 'quick.askCancel': 'Cancel',
  'quick.added': 'Added: “{title}” — {when}', 'quick.addedMany': 'Tasks added: {n}. For example: “{title}” — {when}',
  'quick.hint2': 'Understands dates in Russian and English: “tomorrow at 15:30”, “by Friday”, “15 October”, “in 2 weeks”. One task per line.',
  'quick.eventAdded': 'Event added: “{title}” — {when}',

  'counts.series': 'recurring {n}', 'counts.waiting': 'waiting {n}', 'counts.templates': 'templates {n}',
  'err.unknownReview': 'unknown decision', 'err.badFreq': 'invalid repeat type', 'err.badInterval': 'the interval is a whole number from 1 to 999', 'err.badMode': 'invalid repeat mode',
  'review.tomorrow': 'Tomorrow', 'review.week': 'This week', 'review.none': 'No date', 'review.keep': 'Keep as is',
  'review.done': 'Done', 'review.otherDate': 'Another date…', 'review.moveToDate': 'Move',
  'review.morningTitle': 'Morning review · {n}',
  'review.morningHint': 'Nothing moves without your decision. Deadlines do not change.',
  'review.quietTitle': 'Already reviewed · {n}',
  'review.quietHint': 'These are still unfinished. You already decided what to do with them, so they are not asked about again — but they stay in sight.',
  'review.decidedKept': 'kept', 'review.decidedKeptEvening': 'kept last evening',
  'review.allToTomorrow': 'Everything to tomorrow',
  'confirm.allToTomorrow': 'Move all the tasks shown ({n}) to tomorrow? Deadlines will not change.',
  'review.nothing': 'Nothing unfinished.',
  'review.edit': 'Edit',

  'unconf.title': 'Repeats to confirm · {n}',
  'unconf.hint': 'The app cannot know what happened while it was closed, and it never marks anything by itself. Tell it what happened.',
  'unconf.done': 'Done', 'unconf.doneThen': 'Done on that day', 'unconf.skip': 'Skip', 'unconf.today': 'Do today',
  'unconf.planned': 'planned for {day}',

  'evening.open': 'Evening: wrap-up and tomorrow',
  'evening.title': 'Evening · {day}',
  'evening.reviewTitle': 'Unfinished · {n}',
  'evening.tomorrowTitle': 'Tomorrow · {day}',
  'evening.events': 'Events', 'evening.tasks': 'Tasks for tomorrow', 'evening.week': 'Tasks for the week',
  'evening.repeats': 'Repeats tomorrow', 'evening.deadlines': 'Upcoming deadlines', 'evening.waiting': 'Time to follow up',
  'evening.nothing': 'Nothing is planned for tomorrow.',
  'evening.addTomorrow': 'Add for tomorrow',
  'evening.addPh': 'What to do tomorrow', 'evening.close': 'Close the evening overview',
  'evening.note': 'The evening overview opens only while the app is open: on iPhone an app cannot show a notification by itself while it is closed. You can always open it by hand with the “Evening” button.',
  'evening.deadlineOn': 'deadline {day}',

  'move.tomorrow': 'Tomorrow', 'move.date': 'Another date…',

  'evening.settingsTitle': 'Evening overview',
  'evening.enable': 'Offer the evening overview',
  'evening.time': 'Overview time',
  'evening.settingsNote': 'The overview opens when you start the app after this time (by your own day), once per evening. The app sends no notifications while it is closed.',
  'evening.saved': 'Evening overview settings saved.',

  'wait.title': 'Waiting for others',
  'wait.hint': 'What you are waiting for from other people. These are not tasks: they never become overdue.',
  'wait.what': 'Waiting for', 'wait.from': 'From whom (optional)', 'wait.followUp': 'Remind me (optional)',
  'wait.empty': 'Not waiting for anything.',
  'wait.since': 'since {day}', 'wait.fromWho': 'from {who}', 'wait.followUpOn': 'follow up {day}',
  'wait.resolve': 'Resolved', 'wait.toTask': 'Needs action', 'wait.reopen': 'Back to waiting',
  'wait.resolvedTitle': 'Resolved · {n}', 'wait.note': 'Note (optional)',
  'wait.dueTitle': 'Time to follow up · {n}',
  'wait.checkAgain': 'Followed up — check again in {n} {n|day|days}', 'wait.snooze': 'Postpone to…',
  'wait.snoozeTo': 'Postpone',
  'wait.convertedHint': 'turned into a task',

  'recur.title': 'Recurring tasks',
  'recur.hint': 'A new task appears by itself. If the app was closed, what was skipped is not counted as not done — you confirm it by hand.',
  'recur.name': 'What to repeat', 'recur.every': 'Every', 'recur.start': 'Starting',
  'recur.freq.daily': 'days', 'recur.freq.weekly': 'weeks', 'recur.freq.monthly': 'months', 'recur.freq.yearly': 'years',
  'recur.mode': 'Count',
  'recur.mode.completion': 'from the day it is done', 'recur.mode.fixed': 'on a fixed schedule',
  'recur.modeHint.completion': 'The next one comes the interval after the day you mark the task done.',
  'recur.modeHint.fixed': 'Dates follow the calendar from the start date, whenever you finish.',
  'recur.add': 'Add repeat', 'recur.empty': 'No recurring tasks.',
  'recur.rule.daily.1': 'every day', 'recur.rule.daily.n': 'every {n} days',
  'recur.rule.weekly.1': 'every week', 'recur.rule.weekly.n': 'every {n} weeks',
  'recur.rule.monthly.1': 'every month', 'recur.rule.monthly.n': 'every {n} months',
  'recur.rule.yearly.1': 'every year', 'recur.rule.yearly.n': 'every {n} years',
  'recur.ruleLine': '{rule}, {mode}',
  'recur.next': 'now: {day}', 'recur.paused': 'paused',
  'recur.pause': 'Pause', 'recur.resume': 'Resume',
  'recur.history': 'History', 'recur.historyEmpty': 'Nothing yet',
  'recur.h.done': 'done', 'recur.h.skipped': 'skipped by you', 'recur.h.open': 'waiting',
  'recur.applyOpen': 'Apply to the current task too',
  'recur.badge': 'repeat',
  'recur.capped': 'More than {n} repeats had piled up; only the latest {n} were created. Earlier dates were not created.',
  'recur.created': 'Repeats to confirm were created: {n}. Open “Today” to go through them.',
  'lists.fromTemplate': 'New list from a template',
  'lists.useTemplate': 'Create list “{name}”',
  'lists.templates': 'Templates', 'lists.templatesHint': 'A template is a ready-made list without checkmarks. A new list from a template always starts unticked, and the template itself never changes.',
  'lists.newTemplate': 'New template', 'lists.templateNamePh': 'Template name',
  'lists.editTemplate': 'Edit template', 'lists.saveAsTemplate': 'Save as template',
  'lists.builtin': 'built-in', 'lists.restoreBuiltin': 'Restore built-in templates',
  'lists.restoreHint': 'Built-in templates you deleted are added back as new ones; your own templates are not changed.',
  'lists.itemPh': 'Item', 'lists.categoryPh': 'Category (optional)',
  'lists.addCategory': 'New category', 'lists.categoryNamePh': 'Category name',
  'lists.renameCategory': 'Rename', 'lists.removeCategory': 'Remove category',
  'confirm.removeCategory': 'Remove the category “{name}”? Items are not deleted — they become uncategorized.',
  'lists.noCategory': 'No category', 'lists.rename': 'Name',
  'lists.created': 'List “{name}” created from the template.',
  'lists.templateSaved': 'Template “{name}” saved.',
  'lists.noTemplates': 'No templates.', 'lists.done': 'Done', 'lists.close': 'Close template',
  'lists.itemsCount': '{n} {n|item|items}',
  'cal.prev': 'Previous month', 'cal.next': 'Next month', 'cal.prevYear': 'Previous year', 'cal.nextYear': 'Next year',
  'cal.todayBtn': 'Today', 'cal.yearView': 'Year', 'cal.monthView': 'Month', 'cal.pick': 'Choose month and year',
  'cal.month': 'Month', 'cal.year': 'Year', 'cal.go': 'Go',
  'cal.dayTitle': '{day}', 'cal.isToday': 'today by the calendar', 'cal.isPlanning': 'your planning day',
  'cal.tasks': 'Tasks', 'cal.events2': 'Events', 'cal.deadlines': 'Deadlines on this day', 'cal.weekTasks': 'Tasks of this week · {n}',
  'cal.repeats': 'Repeats',
  'cal.noItems': 'Nothing on this day.',
  'cal.addTo': 'Add for {day}', 'cal.addTitlePh': 'Title', 'cal.addTime': 'Time (optional)',
  'cal.asTask': 'Add task', 'cal.asEvent': 'Add event', 'cal.needTime': 'An event needs a time.',
  'cal.aria': '{day}: {parts}', 'cal.ariaNothing': 'nothing',
  'cal.nTasks': '{n} {n|task|tasks}', 'cal.nDone': '{n} done', 'cal.nEvents': '{n} {n|event|events}', 'cal.nDeadlines': '{n} {n|deadline|deadlines}',
  'cal.legend': '● event  ■ task  ◆ deadline',
  'cal.eventAdded': 'Event added for {day}.', 'cal.taskAdded': 'Task added for {day}.'
};

// ---------- words that quick entry recognises (both languages work in either interface language) ----------
// Weekdays and months are listed with their inflected forms. Nothing here is shown on screen.
export const PARSE_WORDS = {
  // words that mean «1.5 l», «2/3 cup»: a number with a dot or slash followed by one of them is a quantity, not a date
  notDateUnits: ['л', 'мл', 'кг', 'г', 'шт', 'руб', 'р', 'евро', 'чашки', 'чашка', 'чашек', 'ст', 'l', 'ml', 'cl', 'kg', 'g', 'oz', 'lb', 'lbs', 'cup', 'cups', 'tsp', 'tbsp', 'eur', 'usd', 'euro', 'euros', 'dollar', 'dollars', 'pcs', 'pc', 'km', 'm', 'cm', 'mm', 'mi', 'miles', 'hours', 'hrs'],
  today: ['сегодня', 'today'],
  tomorrow: ['завтра', 'tomorrow', 'tmrw', 'tomorow'],
  dayAfter: ['послезавтра', 'day after tomorrow'],
  thisWeek: ['на этой неделе', 'на неделе', 'эту неделю', 'на эту неделю', 'this week'],
  nextWeek: ['на следующей неделе', 'на следующую неделю', 'на след неделе', 'на след. неделе', 'следующей неделе', 'next week'],
  inWord: ['через', 'in'],
  next: ['следующий', 'следующую', 'следующее', 'следующая', 'след.', 'след', 'next'],
  units: {
    day: ['день', 'дня', 'дней', 'дн', 'days', 'day'],
    week: ['неделю', 'недели', 'недель', 'неделя', 'нед', 'weeks', 'week'],
    month: ['месяц', 'месяца', 'месяцев', 'мес', 'months', 'month']
  },
  oneWords: ['один', 'одну', 'одна', 'a', 'an', 'one'],
  weekdays: {
    1: ['понедельник', 'понедельника', 'понедельнику', 'пн', 'monday'],
    2: ['вторник', 'вторника', 'вторнику', 'вт', 'tuesday', 'tues'],
    3: ['среда', 'среду', 'среды', 'ср', 'wednesday'],
    4: ['четверг', 'четверга', 'четвергу', 'чт', 'thursday', 'thurs'],
    5: ['пятница', 'пятницу', 'пятницы', 'пт', 'friday'],
    6: ['суббота', 'субботу', 'субботы', 'сб', 'saturday'],
    7: ['воскресенье', 'воскресенья', 'воскресенью', 'вс', 'sunday']
  },
  months: {
    1: ['января', 'январь', 'янв', 'january', 'jan'],
    2: ['февраля', 'февраль', 'фев', 'february', 'feb'],
    3: ['марта', 'март', 'мар', 'march'],
    4: ['апреля', 'апрель', 'апр', 'april', 'apr'],
    5: ['мая', 'май', 'may'],
    6: ['июня', 'июнь', 'июн', 'june', 'jun'],
    7: ['июля', 'июль', 'июл', 'july', 'jul'],
    8: ['августа', 'август', 'авг', 'august', 'aug'],
    9: ['сентября', 'сентябрь', 'сен', 'сент', 'september', 'sept', 'sep'],
    10: ['октября', 'октябрь', 'окт', 'october', 'oct'],
    11: ['ноября', 'ноябрь', 'ноя', 'нояб', 'november', 'nov'],
    12: ['декабря', 'декабрь', 'дек', 'december', 'dec']
  },
  preps: ['в', 'во', 'на', 'к', 'до', 'on', 'at', 'by', 'in', 'due', 'дедлайн', 'deadline', 'срок', 'числа'],
  deadlineWords: ['до', 'дедлайн', 'срок', 'by', 'due', 'deadline'],
  timeWords: ['в', 'at', 'к', 'около', '@'],
  dayParts: {
    morning: ['утра', 'утром', 'am', 'a.m.'],
    afternoon: ['дня'],
    evening: ['вечера', 'вечером', 'pm', 'p.m.'],
    night: ['ночи', 'ночью'],
    oclock: ["o'clock"]
  }
};

// Full month and weekday names for the calendar (Monday first for weekdays).
export const NAMES = {
  months: {
    ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  },
  monthsShort: {
    ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  },
  weekdaysShort: { // Monday first
    ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  },
  weekdaysLong: {
    ru: ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'],
    en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  }
};

// ---------- built-in list templates (shown in the interface language; editable copies are made on first edit) ----------
export const BUILTIN_DATA = {
  supermarket: {
    ru: {
      name: 'Супермаркет',
      categories: [
        ['Овощи и фрукты', ['Картофель', 'Лук', 'Помидоры', 'Огурцы', 'Яблоки', 'Бананы', 'Лимоны']],
        ['Молочное', ['Молоко', 'Сыр', 'Йогурт', 'Масло сливочное', 'Яйца']],
        ['Мясо и рыба', ['Курица', 'Фарш', 'Рыба']],
        ['Хлеб и выпечка', ['Хлеб', 'Булочки']],
        ['Бакалея', ['Рис', 'Макароны', 'Мука', 'Сахар', 'Соль', 'Масло растительное', 'Кофе', 'Чай']],
        ['Напитки', ['Вода', 'Сок']],
        ['Для дома', ['Туалетная бумага', 'Средство для посуды', 'Мусорные пакеты']]
      ]
    },
    en: {
      name: 'Supermarket',
      categories: [
        ['Fruit and vegetables', ['Potatoes', 'Onions', 'Tomatoes', 'Cucumbers', 'Apples', 'Bananas', 'Lemons']],
        ['Dairy', ['Milk', 'Cheese', 'Yoghurt', 'Butter', 'Eggs']],
        ['Meat and fish', ['Chicken', 'Minced meat', 'Fish']],
        ['Bread and bakery', ['Bread', 'Rolls']],
        ['Pantry', ['Rice', 'Pasta', 'Flour', 'Sugar', 'Salt', 'Cooking oil', 'Coffee', 'Tea']],
        ['Drinks', ['Water', 'Juice']],
        ['Household', ['Toilet paper', 'Dish soap', 'Bin bags']]
      ]
    }
  },
  suitcase: {
    ru: {
      name: 'Чемодан',
      categories: [
        ['Документы', ['Паспорт', 'Билеты', 'Бронь жилья', 'Страховка', 'Банковская карта', 'Наличные']],
        ['Одежда', ['Нижнее бельё', 'Носки', 'Футболки', 'Брюки или джинсы', 'Свитер или куртка', 'Пижама', 'Обувь']],
        ['Гигиена', ['Зубная щётка и паста', 'Шампунь', 'Дезодорант', 'Расчёска', 'Бритва', 'Полотенце']],
        ['Электроника', ['Телефон и зарядка', 'Павербанк', 'Наушники', 'Адаптер для розетки']],
        ['Здоровье', ['Личные лекарства', 'Пластыри', 'Солнцезащитный крем']],
        ['Другое', ['Книга', 'Бутылка для воды', 'Ключи от дома']]
      ]
    },
    en: {
      name: 'Suitcase Packing',
      categories: [
        ['Documents', ['Passport', 'Tickets', 'Accommodation booking', 'Insurance', 'Bank card', 'Cash']],
        ['Clothes', ['Underwear', 'Socks', 'T-shirts', 'Trousers or jeans', 'Sweater or jacket', 'Pyjamas', 'Shoes']],
        ['Toiletries', ['Toothbrush and toothpaste', 'Shampoo', 'Deodorant', 'Hairbrush', 'Razor', 'Towel']],
        ['Electronics', ['Phone and charger', 'Power bank', 'Headphones', 'Plug adapter']],
        ['Health', ['Personal medication', 'Plasters', 'Sunscreen']],
        ['Other', ['Book', 'Water bottle', 'House keys']]
      ]
    }
  }
};
