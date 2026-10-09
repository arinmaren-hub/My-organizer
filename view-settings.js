// «Настройки» screen. For now: appearance (light / dark / system).
// The Evening Preview settings will be added here later.

const CHOICES = [
  ['light', 'Светлое', 'Мягкий тёплый светлый фон'],
  ['dark', 'Тёмное', 'Приглушённые тёмные цвета'],
  ['system', 'Как в системе', 'Следует светлому или тёмному режиму iPhone (Настройки → Экран и яркость)']
];

export function renderSettings(doc, ctx) {
  const current = ctx.appearance;
  return `
    <section class="card">
      <h2>Оформление</h2>
      <div class="choices" role="group" aria-label="Оформление">
        ${CHOICES.map(([mode, label, hint]) => `
          <button type="button" class="choice${current === mode ? ' active' : ''}" data-action="appearance.set" data-mode="${mode}" aria-pressed="${current === mode}">
            <span>${label}${current === mode ? ' ✓' : ''}</span>
            <span class="muted small">${hint}</span>
          </button>`).join('')}
      </div>
      <p class="muted small">Выбор хранится только на этом устройстве и не входит в резервные копии. Окна подтверждения («Удалить?» и т. п.) рисует сама iOS — они всегда следуют настройке iPhone.</p>
    </section>`;
}
