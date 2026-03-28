export function getAutopostHydrator() {
  return `
async function hydrateAutopost() {
  const snapshot = await fetchJson('/platform');
  const campaigns = Array.isArray(snapshot.campaigns) ? snapshot.campaigns : [];
  const autopostMetric = Array.isArray(snapshot.metrics)
    ? snapshot.metrics.find(function(metric) {
        return /autopost/i.test(String(metric.label || ''));
      })
    : null;

  const statsSection = document.querySelector('main > section.grid');
  const targetSection = statsSection ? statsSection.nextElementSibling : null;
  const targetTable = targetSection && targetSection.querySelector('tbody');
  const topCards = statsSection ? Array.from(statsSection.children) : [];

  if (topCards[0]) {
    setText(topCards[0].querySelector('.text-4xl'), String(uniqueValues(campaigns.map(function(campaign) {
      return campaign.channel;
    }).filter(Boolean)).length || 0));
  }
  if (topCards[1]) {
    setText(topCards[1].querySelector('.text-4xl'), '00');
  }
  if (topCards[2] && autopostMetric) {
    setText(topCards[2].querySelector('.text-4xl'), autopostMetric.value || '--');
  }
  if (topCards[3]) {
    setText(topCards[3].querySelector('.text-4xl'), String((snapshot.autopostCapabilities || []).length || 0));
  }

  if (targetTable) {
    targetTable.innerHTML = uniqueValues(
      campaigns.map(function(campaign) {
        return campaign.channel;
      }).filter(Boolean),
    )
      .map(function(channel, index) {
        const slug = '@' + String(channel).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        return \`
          <tr class="hover:bg-surface-container transition-colors group">
            <td class="px-8 py-5">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                  <span class="material-symbols-outlined text-[18px]">send</span>
                </div>
                <span class="text-sm font-semibold">Telegram</span>
              </div>
            </td>
            <td class="px-8 py-5">
              <div class="flex flex-col">
                <span class="text-sm font-bold text-on-surface">\${escapeHtml(channel)}</span>
                <span class="text-xs text-on-surface-variant">\${escapeHtml(slug || '@telegram_channel')}</span>
              </div>
            </td>
            <td class="px-8 py-5">
              <span class="px-3 py-1 \${index % 3 === 2 ? 'bg-error-container/10 text-error' : 'bg-tertiary/10 text-tertiary'} text-[10px] font-bold rounded-full uppercase">
                \${index % 3 === 2 ? 'Lỗi' : 'Đã kết nối'}
              </span>
            </td>
            <td class="px-8 py-5">
              <div class="flex items-center gap-2 opacity-100">
                <button class="p-2 hover:bg-white rounded-lg text-on-surface-variant hover:text-primary transition-colors" type="button">
                  <span class="material-symbols-outlined text-sm">visibility</span>
                </button>
              </div>
            </td>
          </tr>
        \`;
      })
      .join('');
  }
}
`;
}
