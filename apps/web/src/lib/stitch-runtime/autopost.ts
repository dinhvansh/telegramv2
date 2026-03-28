export function getAutopostHydrator() {
  return `
async function hydrateAutopost() {
  const autopost = await fetchJson('/autopost');
  const gridSections = Array.from(document.querySelectorAll('main > section.grid'));
  const statsSection = gridSections[0] || null;
  const targetSection = gridSections[1] || null;
  const bottomSection = gridSections[2] || null;
  const targetFormCard = targetSection && targetSection.children[0];
  const targetTableCard = targetSection && targetSection.children[1];
  const targetTable = targetTableCard && targetTableCard.querySelector('tbody');
  const targetCountLabel = targetTableCard && targetTableCard.querySelector('.px-8.py-6 span');
  const composeCard = bottomSection && bottomSection.children[0];
  const scheduleCard = bottomSection && bottomSection.children[1];
  const topCards = statsSection ? Array.from(statsSection.children) : [];

  const state = {
    targets: Array.isArray(autopost.targets) ? autopost.targets : [],
    schedules: Array.isArray(autopost.schedules) ? autopost.schedules : [],
    logs: Array.isArray(autopost.logs) ? autopost.logs : [],
    stats: autopost.stats || {
      telegramTargets: 0,
      discordTargets: 0,
      sentCount: 0,
      scheduledCount: 0,
    },
  };

  function refreshState(nextSnapshot) {
    state.targets = Array.isArray(nextSnapshot.targets) ? nextSnapshot.targets : state.targets;
    state.schedules = Array.isArray(nextSnapshot.schedules) ? nextSnapshot.schedules : state.schedules;
    state.logs = Array.isArray(nextSnapshot.logs) ? nextSnapshot.logs : state.logs;
    state.stats = nextSnapshot.stats || state.stats;
  }

  function renderStats() {
    if (topCards[0]) {
      setText(topCards[0].querySelector('.text-4xl'), String(state.stats.telegramTargets || 0));
    }
    if (topCards[1]) {
      setText(topCards[1].querySelector('.text-4xl'), String(state.stats.discordTargets || 0));
    }
    if (topCards[2]) {
      setText(topCards[2].querySelector('.text-4xl'), String(state.stats.sentCount || 0));
    }
    if (topCards[3]) {
      setText(topCards[3].querySelector('.text-4xl'), String(state.stats.scheduledCount || 0));
    }
  }

  function renderTargets() {
    if (!targetTable) {
      return;
    }

    targetTable.innerHTML = state.targets.map(function(target) {
      const platformLabel = target.platform === 'DISCORD' ? 'Discord' : target.platform === 'TWITTER' ? 'Twitter/X' : 'Telegram';
      const icon = target.platform === 'DISCORD' ? 'chat' : target.platform === 'TWITTER' ? 'alternate_email' : 'send';
      const iconTone = target.platform === 'DISCORD' ? 'bg-indigo-100 text-indigo-600' : target.platform === 'TWITTER' ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-600';
      const statusTone = /ERROR|FAILED/i.test(String(target.status || ''))
        ? 'bg-error-container/10 text-error'
        : 'bg-tertiary/10 text-tertiary';

      return \`
        <tr class="hover:bg-surface-container transition-colors group">
          <td class="px-8 py-5">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-lg \${iconTone} flex items-center justify-center">
                <span class="material-symbols-outlined text-[18px]">\${icon}</span>
              </div>
              <span class="text-sm font-semibold">\${escapeHtml(platformLabel)}</span>
            </div>
          </td>
          <td class="px-8 py-5">
            <div class="flex flex-col">
              <span class="text-sm font-bold text-on-surface">\${escapeHtml(target.displayName)}</span>
              <span class="text-xs text-on-surface-variant">\${escapeHtml(target.externalId)}</span>
            </div>
          </td>
          <td class="px-8 py-5">
            <span class="px-3 py-1 \${statusTone} text-[10px] font-bold rounded-full uppercase">\${escapeHtml(target.status || 'CONNECTED')}</span>
          </td>
          <td class="px-8 py-5">
            <div class="text-[10px] text-on-surface-variant">Target ID: \${escapeHtml(target.id)}</div>
          </td>
        </tr>
      \`;
    }).join('');

    if (targetCountLabel) {
      targetCountLabel.textContent = ['Tong cong', String(state.targets.length), 'dich den'].join(' ');
    }
  }

  function renderTargetChooser() {
    if (!scheduleCard) {
      return;
    }

    const chooserWrap = scheduleCard.querySelector('.space-y-3.max-h-64');
    if (!chooserWrap) {
      return;
    }

    chooserWrap.innerHTML = state.targets.map(function(target, index) {
      const icon = target.platform === 'DISCORD' ? 'chat' : target.platform === 'TWITTER' ? 'alternate_email' : 'send';
      const tone = target.platform === 'DISCORD' ? 'text-indigo-500' : target.platform === 'TWITTER' ? 'text-slate-500' : 'text-blue-500';
      return \`
        <label class="flex items-center justify-between p-4 bg-surface rounded-xl cursor-pointer hover:bg-surface-container-high transition-all">
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined \${tone}">\${icon}</span>
            <div>
              <span class="text-sm font-semibold">\${escapeHtml(target.displayName)}</span>
              <p class="text-[10px] text-on-surface-variant">\${escapeHtml(target.externalId)}</p>
            </div>
          </div>
          <input data-target-id="\${escapeHtml(target.id)}" \${index === 0 ? 'checked' : ''} class="rounded-md border-none bg-surface-container-highest text-primary focus:ring-0 w-5 h-5" type="checkbox"/>
        </label>
      \`;
    }).join('');
  }

  function renderLogPanel() {
    if (!scheduleCard) {
      return;
    }

    var panel = scheduleCard.querySelector('#autopost-log-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'autopost-log-panel';
      panel.className = 'mt-8 rounded-xl bg-surface px-4 py-4';
      scheduleCard.appendChild(panel);
    }

    panel.innerHTML = [
      '<div class="mb-4 flex items-center justify-between"><h4 class="text-sm font-bold text-on-surface">Nhat ky autopost gan nhat</h4><button id="autopost-dispatch-due" class="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-on-primary">Chay dispatch</button></div>',
      '<div class="space-y-3">',
      (state.logs.length
        ? state.logs.map(function(log) {
            var tone = log.status === 'SENT'
              ? 'bg-tertiary/10 text-tertiary'
              : 'bg-error-container/20 text-error';
            return '<div class="rounded-xl bg-surface-container-low px-4 py-3"><div class="flex items-center justify-between gap-3"><div><div class="text-sm font-semibold text-on-surface">' + escapeHtml(log.schedule.title) + ' • ' + escapeHtml(log.schedule.targetName) + '</div><div class="text-[11px] text-on-surface-variant">' + escapeHtml(log.detail || '') + '</div></div><span class="' + tone + ' rounded-full px-3 py-1 text-[10px] font-black uppercase">' + escapeHtml(log.status) + '</span></div><div class="mt-2 text-[10px] text-on-surface-variant">' + escapeHtml(new Date(log.createdAt).toLocaleString('vi-VN')) + '</div></div>';
          }).join('')
        : '<div class="text-sm text-on-surface-variant">Chua co log autopost. Hay tao schedule hoac chay dispatch.</div>'),
      '</div>',
    ].join('');

    var dispatchButton = panel.querySelector('#autopost-dispatch-due');
    if (dispatchButton && !dispatchButton.dataset.boundDispatch) {
      dispatchButton.dataset.boundDispatch = 'true';
      dispatchButton.addEventListener('click', async function() {
        try {
          const result = await fetchJson('/autopost/dispatch', { method: 'POST' });
          refreshState(result.snapshot || result);
          renderStats();
          renderTargets();
          renderTargetChooser();
          renderLogPanel();
          showBanner('Da chay dispatch cho ' + String(result.dispatched || 0) + ' schedule.', 'success');
        } catch (error) {
          console.error(error);
          showBanner('Khong chay duoc dispatch autopost.', 'danger');
        }
      });
    }
  }

  function bindTargetForm() {
    if (!targetFormCard || targetFormCard.dataset.liveBound) {
      return;
    }
    targetFormCard.dataset.liveBound = 'true';

    const select = targetFormCard.querySelector('select');
    const inputs = targetFormCard.querySelectorAll('input');
    const externalIdInput = inputs[0];
    const displayNameInput = inputs[1];
    const submitButton = targetFormCard.querySelector('button');
    const statusBox = document.createElement('div');
    statusBox.className = 'mt-4 hidden rounded-xl px-4 py-3 text-sm font-medium';
    targetFormCard.appendChild(statusBox);

    submitButton.addEventListener('click', async function() {
      const platformText = select ? String(select.value || 'Kenh Telegram') : 'Kenh Telegram';
      const platform = /Discord/i.test(platformText) ? 'DISCORD' : /Twitter/i.test(platformText) ? 'TWITTER' : 'TELEGRAM';
      const externalId = externalIdInput ? String(externalIdInput.value || '').trim() : '';
      const displayName = displayNameInput ? String(displayNameInput.value || '').trim() : '';

      if (!externalId || !displayName) {
        showInlineStatus(statusBox, 'Vui long nhap ID/webhook va ten hien thi cho muc tieu.', 'warning');
        return;
      }

      try {
        const nextSnapshot = await fetchJson('/autopost/targets', {
          method: 'POST',
          body: JSON.stringify({
            platform: platform,
            externalId: externalId,
            displayName: displayName,
          }),
        });
        refreshState(nextSnapshot);
        renderStats();
        renderTargets();
        renderTargetChooser();
        renderLogPanel();
        externalIdInput.value = '';
        displayNameInput.value = '';
        showInlineStatus(statusBox, 'Da dang ky muc tieu autopost moi.', 'success');
      } catch (error) {
        console.error(error);
        showInlineStatus(statusBox, 'Khong tao duoc muc tieu autopost.', 'danger');
      }
    });
  }

  function bindScheduleComposer() {
    if (!composeCard || !scheduleCard || composeCard.dataset.liveBound) {
      return;
    }
    composeCard.dataset.liveBound = 'true';

    const titleInput = composeCard.querySelector('input[type="text"]');
    const messageInput = composeCard.querySelector('textarea');
    const frequencySelect = scheduleCard.querySelector('select');
    const datetimeInput = scheduleCard.querySelector('input[type="datetime-local"]');
    const actionButtons = scheduleCard.querySelectorAll('button');
    const draftButton = actionButtons[0];
    const scheduleButton = actionButtons[1];
    const statusBox = document.createElement('div');
    statusBox.className = 'mt-6 hidden rounded-xl px-4 py-3 text-sm font-medium';
    scheduleCard.appendChild(statusBox);

    async function submitSchedule(saveAsDraft) {
      const title = titleInput ? String(titleInput.value || '').trim() : '';
      const message = messageInput ? String(messageInput.value || '').trim() : '';
      const frequency = frequencySelect ? String(frequencySelect.value || 'Gui ngay lap tuc') : 'Gui ngay lap tuc';
      const scheduledFor = datetimeInput ? String(datetimeInput.value || '').trim() : '';
      const targetIds = Array.from(scheduleCard.querySelectorAll('[data-target-id]:checked')).map(function(input) {
        return input.getAttribute('data-target-id');
      }).filter(Boolean);

      if (!title || !message || !targetIds.length) {
        showInlineStatus(statusBox, 'Vui long nhap tieu de, noi dung va chon it nhat mot muc tieu.', 'warning');
        return;
      }

      try {
        const created = await fetchJson('/autopost/schedules', {
          method: 'POST',
          body: JSON.stringify({
            title: title,
            message: message,
            frequency: frequency,
            scheduledFor: scheduledFor || null,
            targetIds: targetIds,
            saveAsDraft: saveAsDraft,
          }),
        });

        refreshState(created.snapshot || created);

        const shouldDispatchImmediately =
          !saveAsDraft &&
          (
            !frequencySelect ||
            frequencySelect.selectedIndex === 0 ||
            /immediate|gui ngay|gửi ngay/i.test(frequency)
          );

        if (shouldDispatchImmediately) {
          for (const item of created.items || []) {
            const dispatched = await fetchJson('/autopost/schedules/' + item.id + '/dispatch', {
              method: 'POST',
            });
            refreshState(dispatched.snapshot || dispatched);
          }
        }

        renderStats();
        renderTargets();
        renderTargetChooser();
        renderLogPanel();
        showInlineStatus(statusBox, saveAsDraft ? 'Da luu ban nhap autopost.' : 'Da tao schedule autopost.', 'success');
      } catch (error) {
        console.error(error);
        showInlineStatus(statusBox, 'Khong tao duoc schedule autopost.', 'danger');
      }
    }

    if (draftButton && !draftButton.dataset.boundDraft) {
      draftButton.dataset.boundDraft = 'true';
      draftButton.addEventListener('click', function() {
        submitSchedule(true);
      });
    }

    if (scheduleButton && !scheduleButton.dataset.boundSchedule) {
      scheduleButton.dataset.boundSchedule = 'true';
      scheduleButton.addEventListener('click', function() {
        submitSchedule(false);
      });
    }
  }

  renderStats();
  renderTargets();
  renderTargetChooser();
  renderLogPanel();
  bindTargetForm();
  bindScheduleComposer();
}
`;
}
