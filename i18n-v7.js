// Texts added in 0.7.0 («Цели»). Russian first; every key exists in both languages (tests.js checks that).
// Merged into the dictionaries by i18n.js; a key here overrides an older one.

export const RU7 = {
  'tab.goals': 'Цели',
  'kind.goals': 'Цель', 'kind.series': 'Повторяющееся правило', 'kind.waiting': 'Ожидание', 'kind.templates': 'Шаблон',
  'what.goal': 'Цель', 'what.step': 'Шаг',
  'reason.stepsNotList': 'шаги не являются списком',
  'counts.goals': 'целей {n}',
  'act.addGoal': 'Создать цель', 'act.editGoal': 'Изменить цель', 'act.addStep': 'Добавить шаги', 'act.editStep': 'Изменить шаг', 'act.stepDone': 'Отметить шаг',
  // the Goals tab
  'goals.new': 'Новая цель', 'goals.name': 'Цель', 'goals.namePh': 'Например: записать аудиокнигу',
  'goals.steps': 'Шаги по порядку (необязательно)', 'goals.stepsPh': 'По одному шагу на строку',
  'goals.create': 'Создать',
  'goals.empty': 'Здесь живут большие цели и шаги к ним. Нажмите ＋, чтобы добавить первую.',
  'goals.progress': '{done} из {total}', 'goals.nextMeta': 'дальше: {step}', 'goals.noSteps': 'шагов пока нет', 'goals.allDone': 'все шаги сделаны',
  'goals.reached': 'Достигнутые', 'goals.reachedOn': 'Цель достигнута {day}',
  'goals.markReached': 'Цель достигнута', 'goals.reopen': 'Вернуть в работу',
  'goals.allDoneBanner': 'Все шаги сделаны. Отметить цель достигнутой?',
  'goals.addSteps': 'Добавить шаги', 'goals.stepsEmpty': 'Шагов пока нет. Нажмите ＋ и запишите, с чего начать.',
  'goals.next': 'следующий шаг',
  'goals.note': 'Заметка', 'goals.noteAdd': 'Добавить заметку: идеи, книги, ссылки', 'goals.notePh': 'Идеи, литература, ссылки…', 'goals.noteEdit': 'Изменить заметку',
  'goals.stepsTitle': 'Шаги', 'goals.rename': 'Переименовать', 'goals.step': 'Шаг', 'goals.up': 'Выше', 'goals.down': 'Ниже',
  'goals.reachedHint': 'Достигнутые цели не показывают шаги в «Задачах».',
  'goals.pause': 'Поставить на паузу', 'goals.resume': 'Снять с паузы', 'goals.pausedMeta': 'на паузе',
  'goals.pausedBanner': 'Цель на паузе: её шаги не показываются в «Задачах». Ничего не потеряно.',
  // «Задачи»
  'tasks.goalSteps': 'Шаги к целям', 'tasks.goalMeta': 'Цель: {goal}',
  'tasks.goalStepsHint': 'Без дат и сроков: шаги не становятся «хвостами» и ждут, сколько нужно.',
  // undo
  'undo.stepChecked': 'Шаг сделан', 'undo.stepUnchecked': 'Отметка снята', 'undo.stepDeleted': 'Шаг удалён', 'undo.goalDeleted': 'Цель удалена',
  // search
  'search.ph': 'Задачи, события и цели', 'search.hint': 'Введите слово: найдём среди задач и событий (в том числе прошлых) и в целях, их шагах и заметках.',
  'search.goal': 'Цель', 'search.step': 'Шаг цели «{goal}»', 'search.inNote': 'в заметке', 'search.reached': 'цель достигнута'
};

export const EN7 = {
  'tab.goals': 'Goals',
  'kind.goals': 'Goal', 'kind.series': 'Repeating rule', 'kind.waiting': 'Waiting item', 'kind.templates': 'Template',
  'what.goal': 'Goal', 'what.step': 'Step',
  'reason.stepsNotList': 'steps are not a list',
  'counts.goals': 'goals {n}',
  'act.addGoal': 'Create goal', 'act.editGoal': 'Edit goal', 'act.addStep': 'Add steps', 'act.editStep': 'Edit step', 'act.stepDone': 'Tick step',
  'goals.new': 'New goal', 'goals.name': 'Goal', 'goals.namePh': 'For example: record an audiobook',
  'goals.steps': 'Steps in order (optional)', 'goals.stepsPh': 'One step per line',
  'goals.create': 'Create',
  'goals.empty': 'Big goals and the steps towards them live here. Tap ＋ to add the first one.',
  'goals.progress': '{done} of {total}', 'goals.nextMeta': 'next: {step}', 'goals.noSteps': 'no steps yet', 'goals.allDone': 'all steps done',
  'goals.reached': 'Reached', 'goals.reachedOn': 'Goal reached {day}',
  'goals.markReached': 'Goal reached', 'goals.reopen': 'Back to work',
  'goals.allDoneBanner': 'All steps are done. Mark the goal as reached?',
  'goals.addSteps': 'Add steps', 'goals.stepsEmpty': 'No steps yet. Tap ＋ and write down where to start.',
  'goals.next': 'next step',
  'goals.note': 'Note', 'goals.noteAdd': 'Add a note: ideas, books, links', 'goals.notePh': 'Ideas, reading, links…', 'goals.noteEdit': 'Edit note',
  'goals.stepsTitle': 'Steps', 'goals.rename': 'Rename', 'goals.step': 'Step', 'goals.up': 'Up', 'goals.down': 'Down',
  'goals.reachedHint': 'Reached goals do not show steps in Tasks.',
  'goals.pause': 'Pause', 'goals.resume': 'Resume', 'goals.pausedMeta': 'paused',
  'goals.pausedBanner': 'This goal is paused: its steps are not shown in Tasks. Nothing is lost.',
  'tasks.goalSteps': 'Steps towards goals', 'tasks.goalMeta': 'Goal: {goal}',
  'tasks.goalStepsHint': 'No dates, no deadlines: steps never become tails and wait as long as needed.',
  'undo.stepChecked': 'Step done', 'undo.stepUnchecked': 'Tick removed', 'undo.stepDeleted': 'Step removed', 'undo.goalDeleted': 'Goal deleted',
  'search.ph': 'Tasks, events and goals', 'search.hint': 'Type a word: tasks and events (including past ones) and goals, their steps and notes are searched.',
  'search.goal': 'Goal', 'search.step': 'Step of “{goal}”', 'search.inNote': 'in the note', 'search.reached': 'goal reached'
};
