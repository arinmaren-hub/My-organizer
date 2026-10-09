// First-launch questions (DECISIONS.md, B4 and B9): interface language, then the
// usual wake-up time and bedtime with the suggested end of the day. Everything
// can be skipped; nothing here blocks using the app.

import { esc } from './util.js';
import { t, getLang } from './i18n.js';
import { languageChoices } from './view-settings.js';

export function renderOnboarding(doc, ctx) {
  const o = ctx.onb;
  const time = (name, label, value) => `
    <label class="field"><span>${esc(label)}</span>
      <input type="time" name="${name}" value="${esc(value || '')}"></label>`;
  return `
    <section class="card">
      <h2>${esc(t('onb.title'))}</h2>
      <p class="muted">${esc(t('onb.intro'))}</p>
      <h3>${esc(t('set.language'))}</h3>
      ${languageChoices(getLang())}
    </section>
    <section class="card">
      <h2>${esc(t('onb.dayTitle'))}</h2>
      <form data-form="onboarding.save" autocomplete="off">
        ${time('wake', t('day.wake'), o.wake)}
        ${time('bed', t('day.bed'), o.bed)}
        ${time('cutoff', t('day.cutoff'), o.cutoff)}
        <p class="muted small">${esc(t('onb.dayIntro'))}</p>
        <div class="line">
          <button type="submit" class="primary">${esc(t('onb.save'))}</button>
          <button type="button" data-action="onboarding.skip">${esc(t('onb.skip'))}</button>
        </div>
        <p class="muted small">${esc(t('onb.skipHint'))}</p>
      </form>
    </section>`;
}
