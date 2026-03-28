export function getDashboardHydrator() {
  return `
async function hydrateDashboard() {
  const snapshot = await fetchJson('/platform');
  const metricGrid = document.querySelector('main > header + div');
  const analyticsGrid = metricGrid ? metricGrid.nextElementSibling : null;
  const activitySection = analyticsGrid ? analyticsGrid.nextElementSibling : null;
  const metrics = Array.isArray(snapshot.metrics) ? snapshot.metrics : [];
  const campaigns = Array.isArray(snapshot.campaigns) ? snapshot.campaigns : [];
  const events = Array.isArray(snapshot.eventFeed) ? snapshot.eventFeed : [];

  const metricCards = metricGrid ? Array.from(metricGrid.children) : [];
  const joinMetric = metrics.find(function(metric) {
    return /join|user|người/i.test(String(metric.label || ''));
  });
  const linkMetric = metrics.find(function(metric) {
    return /invite|link/i.test(String(metric.label || ''));
  });
  const autopostMetric = metrics.find(function(metric) {
    return /autopost/i.test(String(metric.label || ''));
  });
  const spamMetric = metrics.find(function(metric) {
    return /spam/i.test(String(metric.label || ''));
  });

  [
    { card: metricCards[0], label: 'Tổng người dùng mới', metric: joinMetric },
    { card: metricCards[1], label: 'Link mời hoạt động', metric: linkMetric },
    { card: metricCards[2], label: 'Tin nhắn Autopost', metric: autopostMetric },
    { card: metricCards[3], label: 'Vụ spam đã chặn', metric: spamMetric },
  ].forEach(function(item) {
    if (!item.card || !item.metric) {
      return;
    }

    setText(item.card.querySelector('p'), item.label);
    setText(item.card.querySelector('h3'), item.metric.value || '--');
    const trend = item.card.querySelector('span.px-2');
    if (trend) {
      trend.textContent = String(item.metric.trend || '--');
    }
  });

  const performanceCard = analyticsGrid && analyticsGrid.children[1];
  const performanceList = performanceCard && performanceCard.querySelector('.space-y-6');
  if (performanceList) {
    performanceList.innerHTML = campaigns
      .slice()
      .sort(function(left, right) {
        return Number(right.conversionRate || 0) - Number(left.conversionRate || 0);
      })
      .slice(0, 4)
      .map(function(campaign) {
        const progress = Math.max(0, Math.min(100, Number(campaign.conversionRate || 0)));
        return \`
          <div class="space-y-2">
            <div class="flex justify-between text-xs font-bold">
              <span class="text-on-surface">\${escapeHtml(campaign.name || 'Campaign')}</span>
              <span class="text-primary">\${escapeHtml(campaign.joinRate || '0% conversion')}</span>
            </div>
            <div class="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
              <div class="bg-primary h-full rounded-full" style="width: \${progress}%"></div>
            </div>
          </div>
        \`;
      })
      .join('');
  }

  const activityBody = activitySection && activitySection.querySelector('tbody');
  if (activityBody) {
    activityBody.innerHTML = events
      .slice(0, 5)
      .map(function(event) {
        const tone = String(event.tone || 'primary');
        const icon = eventIconMap[tone] || 'notifications_active';
        const shell = eventShellMap[tone] || eventShellMap.primary;

        return \`
          <tr class="hover:bg-surface-container-low transition-colors">
            <td class="px-6 py-5 text-sm text-on-surface-variant">\${escapeHtml(event.time || '--:--')}</td>
            <td class="px-6 py-5">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full \${shell.wrap} flex items-center justify-center">
                  <span class="material-symbols-outlined text-sm">\${icon}</span>
                </div>
                <span class="text-sm font-semibold text-on-surface">\${escapeHtml(event.title || 'System event')}</span>
              </div>
            </td>
            <td class="px-6 py-5 text-sm text-on-surface">\${escapeHtml(event.detail || '')}</td>
            <td class="px-6 py-5">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold \${shell.badge}">
                \${escapeHtml(statusLabelMap[tone] || 'Hoạt động')}
              </span>
            </td>
            <td class="px-6 py-5">
              <button class="p-2 hover:bg-surface-container rounded-lg text-on-surface-variant">
                <span class="material-symbols-outlined text-sm">more_horiz</span>
              </button>
            </td>
          </tr>
        \`;
      })
      .join('');
  }
}
`;
}
