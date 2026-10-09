// «Настройки» screen: interface language and appearance.
// (Step B of 0.3.0 adds «Мой день»; the Evening Preview settings come later.)

import { esc } from './util.js';
import { t, LANGS, LANG_NAMES } from './i18n.js';

const APPEARANCE = [
  ['light', 'set.light', 'set.lightHint'],
  ['dark', 'set.dark', 'set.darkHint'],
  ['system', 'set.system', 'set.systemHint']
];


function choice(action, value, current, label, hint) {
  const on = current === value;
  return `
    <button type="button" class="choice${on ? ' active' : ''}" data-action="${action}" data-mode="${value}" aria-pressed="${on}">
      <span>${esc(label)}${on ? ' ✓' : ''}</span>
      ${hint ? `<span class="muted small">${esc(hint)}</span>` : ''}
    </button>`;
}

export function languageChoices(current) {
  return `<div class="choices" role="group" aria-label="${esc(t('set.language'))}">
    ${LANGS.map(code => choice('language.set', code, current, LANG_NAMES[code], '')).join('')}
  </div>`;
}

function daySection(day) {
  const time = (name, label, value) => `
    <label class="field"><span>${esc(label)}</span>
      <input type="time" name="${name}" value="${esc(value || '')}"></label>`;
  return `
    <section class="card">
      <h2>${esc(t('day.title'))}</h2>
      <form data-form="day.save" autocomplete="off">
        ${time('wake', t('day.wake'), day.wake)}
        ${time('bed', t('day.bed'), day.bed)}
        ${time('cutoff', t('day.cutoff'), day.cutoff)}
        <p class="muted small">${esc(t('day.cutoffHint'))}</p>
        <div class="line">
          <button type="button" data-action="day.suggest">${esc(t('day.suggest'))}</button>
          <button type="submit" class="primary">${esc(t('day.save'))}</button>
        </div>
        <p class="muted small">${esc(t('day.note'))}</p>
      </form>
    </section>`;
}

export function renderSettings(doc, ctx) {
  return `
    ${daySection(doc.settings.day)}
    <section class="card">
      <h2>${esc(t('set.language'))}</h2>
      ${languageChoices(ctx.language)}
      <p class="muted small">${esc(t('set.languageNote'))}</p>
    </section>
    <section class="card">
      <h2>${esc(t('set.appearance'))}</h2>
      <div class="choices" role="group" aria-label="${esc(t('set.appearance'))}">
        ${APPEARANCE.map(([mode, label, hint]) => choice('appearance.set', mode, ctx.appearance, t(label), t(hint))).join('')}
      </div>
      <p class="muted small">${esc(t('set.appearanceNote'))}</p>
    </section>`;
}
