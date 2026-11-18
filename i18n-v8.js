// Texts added in 0.8.0 («Сегодня / Завтра», «Повторять», several weekdays).
//
// English is PAUSED (owner's decision, 2026-11-15): new texts are written in Russian only. i18n.js copies every
// key below into the English dictionary unchanged, so English mode shows these few texts in Russian instead of
// showing a technical key. EN8 holds the occasional English text that does exist; it wins over the copy.

export const RU8 = {
  // fast entry
  'quick.today': 'Сегодня', 'quick.tomorrow': 'Завтра', 'quick.dayAria': 'На какой день',
  // «Повторять»
  'repeat.btn': 'Повторять', 'repeat.title': 'Повторять',
  'repeat.daily': 'Каждый день',
  'repeat.weekly': 'Каждую неделю, {on}', 'repeat.biweekly': 'Каждые 2 недели, {on}',
  'repeat.days': 'По дням недели', 'repeat.daysHint': '{day} — день, с которого всё начинается: он входит всегда.',
  'repeat.monthly': 'Каждый месяц, {n}-го числа', 'repeat.yearly': 'Каждый год, {date}',
  'repeat.until': 'До какого дня (можно не указывать)',
  'repeat.first': 'Первый раз: {day}. Раньше этого дня ничего не появится.',
  'repeat.more': 'Другие правила (например, «2-й вторник месяца») можно выбрать потом в «Изменить повтор».',
  'repeat.save': 'Повторять',
  'repeat.repeats': 'Повторяется: {rule}', 'repeat.edit': 'Изменить повтор',
  'repeat.done': 'Теперь повторяется: {rule}',
  'repeat.on.1': 'по понедельникам', 'repeat.on.2': 'по вторникам', 'repeat.on.3': 'по средам', 'repeat.on.4': 'по четвергам',
  'repeat.on.5': 'по пятницам', 'repeat.on.6': 'по субботам', 'repeat.on.7': 'по воскресеньям',
  'err.alreadyRepeats': 'Это уже повторяется: правило можно изменить в «Изменить повтор».',
  // several weekdays in the rule editor
  'recur.days': 'Дни недели', 'recur.daysHint': 'Можно отметить несколько дней (например, пн и чт). Без отметок — тот же день недели, что и начало.',
  'recur.ruleDays': '{rule}: {days}'
};

export const EN8 = {};
