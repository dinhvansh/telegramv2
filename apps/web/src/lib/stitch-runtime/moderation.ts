export function getModerationHydrator(pageMode = "moderation") {
  return `
async function hydrateModeration() {
  const pageMode = ${JSON.stringify(pageMode)};
  const results = await Promise.all([
    fetchJson('/moderation/members'),
    fetchJson('/moderation/events').catch(function() {
      return [];
    }),
    fetchJson('/moderation/config').catch(function() {
      return { builtInRules: {}, scopes: [] };
    }),
    fetchJson('/system-logs?limit=80').catch(function() {
      return [];
    }),
  ]);

  const moderation = results[0];
  const events = Array.isArray(results[1]) ? results[1] : [];
  const config = results[2] || { builtInRules: {}, scopes: [] };
  const systemLogs = Array.isArray(results[3]) ? results[3] : [];
  const mainGrid = document.querySelector('main > div.grid');
  const tableSection = mainGrid && mainGrid.querySelector('section');
  const sidePanel = mainGrid && mainGrid.querySelector('aside');
  const table = tableSection && tableSection.querySelector('table');
  const theadRow = table && table.querySelector('thead tr');
  const tbody = table && table.querySelector('tbody');
  const loadMoreButton = tableSection && Array.from(tableSection.querySelectorAll('button')).find(function(button) {
    return /Xem thêm/i.test(String(button.textContent || ''));
  });
  const headerButtons = tableSection ? tableSection.querySelectorAll('.px-8.py-6 button') : [];
  const downloadButton = headerButtons && headerButtons[0];

  const state = {
    members: Array.isArray(moderation.members) ? moderation.members : [],
    summary: moderation.summary || { total: 0, active: 0, left: 0 },
    events: events,
    systemLogs: systemLogs,
    scopes: Array.isArray(config.scopes) ? config.scopes : [],
    builtInRules: config.builtInRules || {},
    selectedScopeKey: config.scopes && config.scopes[0] ? config.scopes[0].scopeKey : 'global',
  };

  function getSelectedScope() {
    return state.scopes.find(function(scope) {
      return scope.scopeKey === state.selectedScopeKey;
    }) || state.scopes[0] || {
      scopeKey: 'global',
      scopeLabel: 'Mặc định toàn hệ thống',
      scopeType: 'GLOBAL',
      keywords: [],
      domains: [],
      autoBanSpam: true,
      muteNewMembers: true,
      muteDurationHours: 24,
      inheritsFromGlobal: false,
    };
  }

  function syncConfig(nextConfig) {
    state.scopes = Array.isArray(nextConfig.scopes) ? nextConfig.scopes : state.scopes;
    state.builtInRules = nextConfig.builtInRules || state.builtInRules;
  }

  async function refreshEvents() {
    state.events = await fetchJson('/moderation/events').catch(function() {
      return state.events;
    });
    state.systemLogs = await fetchJson('/system-logs?limit=80').catch(function() {
      return state.systemLogs;
    });
    renderThreatCard();
    renderLogSection();
    renderSystemLogSection();
  }

  function renderMemberTable() {
    if (theadRow) {
      theadRow.innerHTML = [
        '<th class="px-8 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">Hồ sơ người dùng</th>',
        '<th class="px-4 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">Chiến dịch</th>',
        '<th class="px-4 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">Nhóm</th>',
        '<th class="px-4 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">ID / Username</th>',
        '<th class="px-4 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">Hiện trạng</th>',
        '<th class="px-8 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">Thời gian tham gia</th>',
      ].join('');
    }

    if (tbody) {
      tbody.innerHTML = state.members
        .map(function(member) {
          const isLeft = member.membershipStatus === 'left';
          const badgeClass = isLeft
            ? 'bg-error-container/20 text-error'
            : 'bg-tertiary/10 text-tertiary';
          const initialsClass = isLeft
            ? 'bg-surface-container-high text-on-surface-variant'
            : 'bg-primary-container text-primary';
          return \`
            <tr class="hover:bg-surface-container-low/30 transition-colors group">
              <td class="px-8 py-5">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl \${initialsClass} flex items-center justify-center font-bold">\${escapeHtml(member.avatarInitials || 'MB')}</div>
                  <div class="flex flex-col gap-0.5">
                    <span class="font-bold text-sm text-on-surface">\${escapeHtml(member.displayName || 'Member')}</span>
                    <span class="text-[11px] text-on-surface-variant">\${escapeHtml(member.statusDetail || '')}</span>
                  </div>
                </div>
              </td>
              <td class="px-4 py-5">
                <span class="text-xs font-semibold px-2 py-1 bg-secondary-container text-on-secondary-container rounded-lg">\${escapeHtml(member.campaignLabel || 'Trực tiếp')}</span>
              </td>
              <td class="px-4 py-5 text-sm font-medium text-on-surface-variant">\${escapeHtml(member.groupTitle || 'Telegram Group')}</td>
              <td class="px-4 py-5">
                <div class="text-xs text-on-surface font-mono">\${escapeHtml(member.externalId || '')}</div>
                <div class="text-[10px] text-primary font-bold">\${escapeHtml(member.username ? '@' + member.username.replace(/^@/, '') : 'N/A')}</div>
              </td>
              <td class="px-4 py-5">
                <div class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide \${badgeClass}">
                  <span class="w-1.5 h-1.5 rounded-full \${isLeft ? 'bg-error' : 'bg-tertiary'}"></span>
                  \${escapeHtml(member.statusLabel || 'Đang ở trong nhóm')}
                </div>
              </td>
              <td class="px-8 py-5">
                <div class="text-xs font-medium text-on-surface-variant">\${escapeHtml(member.joinedRelative || '')}</div>
                <div class="text-[10px] text-on-surface-variant/70">\${escapeHtml(new Date(member.joinedAt).toLocaleString('vi-VN'))}</div>
              </td>
            </tr>
          \`;
        })
        .join('');
    }

    if (loadMoreButton) {
      loadMoreButton.textContent = 'Đang theo dõi ' + String(state.summary.total || state.members.length) + ' thành viên';
    }

    if (downloadButton && !downloadButton.dataset.liveBound) {
      downloadButton.dataset.liveBound = 'true';
      downloadButton.setAttribute('title', 'Tải CSV thành viên');
      downloadButton.addEventListener('click', function() {
        const rows = [
          ['display_name', 'campaign_label', 'group_title', 'external_id', 'username', 'membership_status', 'joined_at', 'left_at'],
        ].concat(
          state.members.map(function(member) {
            return [
              member.displayName || '',
              member.campaignLabel || '',
              member.groupTitle || '',
              member.externalId || '',
              member.username || '',
              member.membershipStatus || '',
              member.joinedAt || '',
              member.leftAt || '',
            ];
          }),
        );

        const csv = rows
          .map(function(row) {
            return row
              .map(function(value) {
                return '"' + String(value).replace(/"/g, '""') + '"';
              })
              .join(',');
          })
          .join('\\n');

        triggerDownload('moderation-members.csv', '\\uFEFF' + csv, 'text/csv;charset=utf-8');
        showBanner('Đã tải danh sách thành viên moderation dưới dạng CSV.', 'success');
      });
    }
  }

  function patchPageMode() {
    const headerTitle = document.querySelector('main header h1');
    const headerSubtitle = document.querySelector('main header p');
    const protectionCard = sidePanel && sidePanel.children[0];

    if (pageMode === 'spam') {
      if (headerTitle) {
        headerTitle.textContent = 'Quản lý spam';
      }
      if (headerSubtitle) {
        headerSubtitle.textContent = 'Thiết lập policy anti-spam, block/allow domain và xử lý các sự kiện bị chấm điểm.';
      }
      if (tableSection) {
        tableSection.remove();
      }
    } else {
      if (headerTitle) {
        headerTitle.textContent = 'Quản lý người dùng';
      }
      if (headerSubtitle) {
        headerSubtitle.textContent = 'Theo dõi thành viên mới, trạng thái ở lại hay rời nhóm và tải danh sách để đối soát.';
      }
      if (protectionCard) {
        protectionCard.remove();
      }
    }
  }

  function renderThreatCard() {
    if (!sidePanel) {
      return;
    }

    const threatCard = Array.from(sidePanel.children).find(function(element) {
      return /đe dọa|ổn định/i.test(String(element.textContent || ''));
    });
    const latestEvent = state.events[0];

    if (!threatCard) {
      return;
    }

    const statText = threatCard.querySelector('.text-xs.font-bold.opacity-90');
    const title = threatCard.querySelector('.text-3xl.font-black');
    const ctaButton = threatCard.querySelector('button');

    if (title) {
      title.textContent = latestEvent
        ? String(latestEvent.manualDecisionLabel || latestEvent.decisionLabel || latestEvent.decision || 'Theo dõi')
        : state.summary.left > 0
          ? 'Theo dõi sát'
          : 'Ổn định';
    }

    if (statText) {
      statText.textContent = latestEvent
        ? 'Sự kiện mới nhất: ' + String(latestEvent.actorUsername || 'unknown') + ' / score ' + String(latestEvent.finalScore || 0)
        : String(state.summary.active || 0) +
          ' thành viên còn trong nhóm, ' +
          String(state.summary.left || 0) +
          ' thành viên đã rời.';
    }

    if (ctaButton && !ctaButton.dataset.boundLogScroll) {
      ctaButton.dataset.boundLogScroll = 'true';
      ctaButton.textContent = 'Xem nhật ký chấm điểm';
      ctaButton.addEventListener('click', function() {
        var logSection = document.getElementById('moderation-log-section');
        if (logSection) {
          logSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  }

  function bindActionButtons(logSection) {
    logSection.querySelectorAll('[data-event-action]').forEach(function(button) {
      if (button.dataset.boundAction) {
        return;
      }
      button.dataset.boundAction = 'true';
      button.addEventListener('click', async function() {
        const note = window.prompt('Ghi chú moderation (có thể bỏ trống):', '') || '';
        try {
          const result = await fetchJson('/moderation/events/' + button.dataset.eventId + '/action', {
            method: 'POST',
            body: JSON.stringify({
              decision: button.dataset.eventAction,
              note: note,
            }),
          });
          var operations = result && result.action && Array.isArray(result.action.operations)
            ? result.action.operations.map(function(item) {
                return item.method + ': ' + (item.ok ? 'ok' : (item.description || 'fail'));
              }).join(' | ')
            : '';
          showBanner(
            operations
              ? 'Đã cập nhật action. Telegram ops: ' + operations
              : 'Đã cập nhật action thủ công cho sự kiện moderation.',
            result && result.action && result.action.enforced ? 'success' : 'warning'
          );
          await refreshEvents();
        } catch (error) {
          console.error(error);
          showBanner('Không cập nhật được action moderation.', 'danger');
        }
      });
    });
  }

  function renderLogSection() {
    if (!mainGrid || !tableSection) {
      return;
    }

    var logSection = document.getElementById('moderation-log-section');
    if (!logSection) {
      logSection = document.createElement('section');
      logSection.id = 'moderation-log-section';
      logSection.className = 'lg:col-span-8 bg-surface-container-lowest rounded-xl shadow-[0_8px_32px_rgba(42,52,57,0.04)] overflow-hidden';
      if (tableSection.nextSibling) {
        mainGrid.insertBefore(logSection, tableSection.nextSibling);
      } else {
        mainGrid.appendChild(logSection);
      }
    }

    logSection.innerHTML = \`
      <div class="px-8 py-6 flex items-center justify-between border-b border-surface-container-low">
        <div>
          <h3 class="text-lg font-bold text-on-surface uppercase tracking-wide">Nhật ký chấm điểm spam</h3>
          <p class="text-xs text-on-surface-variant mt-1">Hiển thị 50 sự kiện moderation gần nhất với rule, score, quyết định và action thủ công.</p>
        </div>
        <div class="text-xs font-semibold text-on-surface-variant">\${escapeHtml(String(state.events.length))} sự kiện</div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-surface-container-low/50">
              <th class="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">User / Nhóm</th>
              <th class="px-4 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">Rule trúng</th>
              <th class="px-4 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">Điểm</th>
              <th class="px-4 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">Quyết định</th>
              <th class="px-4 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">Action tay</th>
              <th class="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">Thời gian</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-container-low">
            \${state.events.length ? state.events.map(function(event) {
              var decisionTone = /BAN|RESTRICT/.test(String(event.decision || ''))
                ? 'bg-error/10 text-error'
                : /WARN|REVIEW/.test(String(event.decision || ''))
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'bg-tertiary/10 text-tertiary';
              var manualTone = /BAN|RESTRICT/.test(String(event.manualDecision || ''))
                ? 'bg-error/10 text-error'
                : /WARN|REVIEW/.test(String(event.manualDecision || ''))
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'bg-surface-container-low text-on-surface-variant';
              var latestActionLog = Array.isArray(event.actionLogs) && event.actionLogs.length
                ? event.actionLogs[event.actionLogs.length - 1]
                : null;
              var rules = Array.isArray(event.matchedRules) && event.matchedRules.length
                ? event.matchedRules.map(function(rule) {
                    return '<span class="rounded-full bg-surface-container-low px-2 py-1">' + escapeHtml(String(rule)) + '</span>';
                  }).join('')
                : '<span class="text-on-surface-variant">Không trúng rule cứng</span>';
              return \`
                <tr class="align-top">
                  <td class="px-6 py-4">
                    <div class="font-semibold text-sm text-on-surface">\${escapeHtml(event.actorUsername || 'unknown-user')}</div>
                    <div class="text-[11px] text-on-surface-variant">\${escapeHtml(event.groupTitle || 'Telegram Group')}</div>
                    <div class="text-[10px] text-on-surface-variant/70 mt-1">\${escapeHtml(event.messageText || 'Không có nội dung text')}</div>
                  </td>
                  <td class="px-4 py-4">
                    <div class="flex flex-wrap gap-2 text-[10px] font-bold text-on-surface-variant">\${rules}</div>
                  </td>
                  <td class="px-4 py-4 text-xs text-on-surface">
                    <div>Rule: <span class="font-bold">\${escapeHtml(String(event.ruleScore || 0))}</span></div>
                    <div>AI: <span class="font-bold">\${escapeHtml(String(event.aiScore == null ? '-' : event.aiScore))}</span></div>
                    <div>Final: <span class="font-black text-primary">\${escapeHtml(String(event.finalScore || 0))}</span></div>
                  </td>
                  <td class="px-4 py-4">
                    <span class="inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide \${decisionTone}">
                      \${escapeHtml(event.decisionLabel || event.decision || 'ALLOW')}
                    </span>
                    <div class="text-[10px] text-on-surface-variant mt-2">\${escapeHtml(event.aiReason || '')}</div>
                  </td>
                  <td class="px-4 py-4">
                    <div class="flex flex-wrap gap-2 mb-3">
                      <button data-event-id="\${escapeHtml(event.id)}" data-event-action="ALLOW" class="rounded-full bg-surface-container-low px-3 py-1 text-[10px] font-black text-on-surface-variant">Allow</button>
                      <button data-event-id="\${escapeHtml(event.id)}" data-event-action="REVIEW" class="rounded-full bg-surface-container-low px-3 py-1 text-[10px] font-black text-on-surface-variant">Review</button>
                      <button data-event-id="\${escapeHtml(event.id)}" data-event-action="RESTRICT" class="rounded-full bg-surface-container-low px-3 py-1 text-[10px] font-black text-on-surface-variant">Restrict</button>
                      <button data-event-id="\${escapeHtml(event.id)}" data-event-action="BAN" class="rounded-full bg-surface-container-low px-3 py-1 text-[10px] font-black text-on-surface-variant">Ban</button>
                    </div>
                    \${event.manualDecision ? '<div class="inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ' + manualTone + '">' + escapeHtml(event.manualDecisionLabel || event.manualDecision) + '</div>' : '<div class="text-[10px] text-on-surface-variant">Chưa có action tay</div>'}
                    <div class="text-[10px] text-on-surface-variant mt-2">\${escapeHtml(event.manualNote || '')}</div>
                    \${latestActionLog ? '<div class="mt-2 text-[10px] text-on-surface-variant">Telegram: ' + escapeHtml(String((latestActionLog.result && latestActionLog.result.operations || []).map(function(op) { return op.method + ':' + (op.ok ? 'ok' : 'fail'); }).join(' | ') || latestActionLog.result && latestActionLog.result.reason || 'logged')) + '</div>' : ''}
                  </td>
                  <td class="px-6 py-4 text-xs text-on-surface-variant">
                    <div>\${escapeHtml(new Date(event.createdAt).toLocaleString('vi-VN'))}</div>
                    <div class="mt-2 text-[10px]">\${escapeHtml(event.reviewedAt ? 'Review lúc ' + new Date(event.reviewedAt).toLocaleString('vi-VN') : '')}</div>
                  </td>
                </tr>
              \`;
            }).join('') : '<tr><td colspan="6" class="px-6 py-8 text-center text-sm text-on-surface-variant">Chưa có log moderation. Hãy bắn Telegram mock hoặc gọi analyze để tạo dữ liệu.</td></tr>'}
          </tbody>
        </table>
      </div>
    \`;

    bindActionButtons(logSection);
  }

  function renderSystemLogSection() {
    if (!mainGrid) {
      return;
    }

    var logSection = document.getElementById('system-log-section');
    if (!logSection) {
      logSection = document.createElement('section');
      logSection.id = 'system-log-section';
      logSection.className = 'lg:col-span-12 bg-surface-container-lowest rounded-xl shadow-[0_8px_32px_rgba(42,52,57,0.04)] overflow-hidden';
      mainGrid.appendChild(logSection);
    }

    logSection.innerHTML = \`
      <div class="px-8 py-6 flex items-center justify-between border-b border-surface-container-low">
        <div>
          <h3 class="text-lg font-bold text-on-surface uppercase tracking-wide">Nhật ký hệ thống</h3>
          <p class="text-xs text-on-surface-variant mt-1">Log có cấu trúc cho Telegram, moderation và các action quan trọng. Có thể tải JSON để gửi khi debug live.</p>
        </div>
        <div class="flex items-center gap-2">
          <button id="system-log-refresh" class="rounded-xl bg-surface-container-low px-3 py-2 text-xs font-bold text-on-surface-variant">Refresh</button>
          <button id="system-log-download" class="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-on-primary">Tải JSON</button>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-surface-container-low/50">
              <th class="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">Thời gian</th>
              <th class="px-4 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">Level</th>
              <th class="px-4 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">Scope / Action</th>
              <th class="px-4 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">Message</th>
              <th class="px-6 py-4 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface-variant">Detail</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-container-low">
            \${state.systemLogs.length ? state.systemLogs.map(function(item) {
              var tone = /ERROR/.test(String(item.level || ''))
                ? 'text-error'
                : /WARN/.test(String(item.level || ''))
                  ? 'text-secondary'
                  : 'text-tertiary';
              return '<tr class="align-top"><td class="px-6 py-4 text-xs text-on-surface-variant">' + escapeHtml(new Date(item.createdAt).toLocaleString('vi-VN')) + '</td><td class="px-4 py-4 text-xs font-black ' + tone + '">' + escapeHtml(String(item.level || 'INFO')) + '</td><td class="px-4 py-4 text-xs text-on-surface"><div class="font-semibold">' + escapeHtml(String(item.scope || 'system')) + '</div><div class="text-[10px] text-on-surface-variant">' + escapeHtml(String(item.action || 'event')) + '</div></td><td class="px-4 py-4 text-xs text-on-surface">' + escapeHtml(String(item.message || '')) + '</td><td class="px-6 py-4 text-[11px] text-on-surface-variant">' + escapeHtml(String(item.detail || '')) + '</td></tr>';
            }).join('') : '<tr><td colspan="5" class="px-6 py-8 text-center text-sm text-on-surface-variant">Chưa có system log.</td></tr>'}
          </tbody>
        </table>
      </div>
    \`;

    var refreshButton = logSection.querySelector('#system-log-refresh');
    if (refreshButton && !refreshButton.dataset.boundRefresh) {
      refreshButton.dataset.boundRefresh = 'true';
      refreshButton.addEventListener('click', refreshEvents);
    }

    var downloadButton = logSection.querySelector('#system-log-download');
    if (downloadButton && !downloadButton.dataset.boundDownload) {
      downloadButton.dataset.boundDownload = 'true';
      downloadButton.addEventListener('click', function() {
        triggerDownload(
          'system-logs.json',
          JSON.stringify(state.systemLogs, null, 2),
          'application/json;charset=utf-8'
        );
        showBanner('Đã tải system logs JSON.', 'success');
      });
    }
  }

  async function savePolicy() {
    const selectedScope = getSelectedScope();
    const protectionCard = sidePanel && sidePanel.children[0];
    const toggles = protectionCard ? protectionCard.querySelectorAll('input[type="checkbox"]') : [];
    const autoBanToggle = toggles[0];
    const muteNewToggle = toggles[1];
    try {
      const updated = await fetchJson('/moderation/config', {
        method: 'PUT',
        body: JSON.stringify({
          scopeKey: selectedScope.scopeKey,
          autoBanSpam: Boolean(autoBanToggle && autoBanToggle.checked),
          muteNewMembers: Boolean(muteNewToggle && muteNewToggle.checked),
          muteDurationHours: Number(document.getElementById('moderation-mute-hours') && document.getElementById('moderation-mute-hours').value || 24),
        }),
      });
      syncConfig(updated);
      showBanner('Đã lưu policy anti-spam cho scope đang chọn.', 'success');
      renderConfigPanel();
    } catch (error) {
      console.error(error);
      showBanner('Không lưu được policy anti-spam.', 'danger');
    }
  }

  function bindKeywordButtons(chipWrap, textarea) {
    chipWrap.querySelectorAll('[data-keyword-id]').forEach(function(button) {
      if (button.dataset.boundDelete) {
        return;
      }
      button.dataset.boundDelete = 'true';
      button.addEventListener('click', async function() {
        try {
          const updated = await fetchJson('/moderation/keywords/' + button.dataset.keywordId, {
            method: 'DELETE',
          });
          syncConfig(updated);
          showBanner('Đã gỡ keyword khỏi scope anti-spam.', 'success');
          renderConfigPanel();
        } catch (error) {
          console.error(error);
          showBanner('Không gỡ được keyword.', 'danger');
        }
      });
    });

    const addButton = document.getElementById('moderation-add-keywords');
    if (addButton && !addButton.dataset.boundAdd) {
      addButton.dataset.boundAdd = 'true';
      addButton.addEventListener('click', async function() {
        const candidates = String(textarea && textarea.value || '')
          .split(/[\\n,]/)
          .map(function(item) { return item.trim(); })
          .filter(Boolean);

        if (!candidates.length) {
          showBanner('Nhập ít nhất một keyword trước khi thêm.', 'warning');
          return;
        }

        try {
          var updated = null;
          for (const keyword of candidates) {
            updated = await fetchJson('/moderation/keywords', {
              method: 'POST',
              body: JSON.stringify({
                scopeKey: getSelectedScope().scopeKey,
                value: keyword,
              }),
            });
          }
          if (updated) {
            syncConfig(updated);
          }
          if (textarea) {
            textarea.value = '';
          }
          showBanner('Đã thêm keyword cho scope anti-spam.', 'success');
          renderConfigPanel();
        } catch (error) {
          console.error(error);
          showBanner('Không thêm được keyword.', 'danger');
        }
      });
    }
  }

  function bindDomainButtons(domainWrap, domainInput, modeSelect) {
    domainWrap.querySelectorAll('[data-domain-id]').forEach(function(button) {
      if (button.dataset.boundDelete) {
        return;
      }
      button.dataset.boundDelete = 'true';
      button.addEventListener('click', async function() {
        try {
          const updated = await fetchJson('/moderation/domains/' + button.dataset.domainId, {
            method: 'DELETE',
          });
          syncConfig(updated);
          showBanner('Đã gỡ domain khỏi scope anti-spam.', 'success');
          renderConfigPanel();
        } catch (error) {
          console.error(error);
          showBanner('Không gỡ được domain.', 'danger');
        }
      });
    });

    const addButton = document.getElementById('moderation-add-domain');
    if (addButton && !addButton.dataset.boundAddDomain) {
      addButton.dataset.boundAddDomain = 'true';
      addButton.addEventListener('click', async function() {
        const value = String(domainInput && domainInput.value || '').trim();
        if (!value) {
          showBanner('Nhập domain trước khi thêm.', 'warning');
          return;
        }

        try {
          const updated = await fetchJson('/moderation/domains', {
            method: 'POST',
            body: JSON.stringify({
              scopeKey: getSelectedScope().scopeKey,
              value: value,
              mode: String(modeSelect && modeSelect.value || 'BLOCK'),
            }),
          });
          syncConfig(updated);
          if (domainInput) {
            domainInput.value = '';
          }
          showBanner('Đã cập nhật danh sách domain cho scope anti-spam.', 'success');
          renderConfigPanel();
        } catch (error) {
          console.error(error);
          showBanner('Không thêm được domain.', 'danger');
        }
      });
    }
  }

  function renderConfigPanel() {
    if (!sidePanel) {
      return;
    }

    const protectionCard = sidePanel.children[0];
    if (!protectionCard) {
      return;
    }

    const selectedScope = getSelectedScope();
    const toggles = protectionCard.querySelectorAll('input[type="checkbox"]');
    const autoBanToggle = toggles[0];
    const muteNewToggle = toggles[1];
    const textarea = protectionCard.querySelector('textarea');
    const actionButton = protectionCard.querySelector('button.w-full');
    const keywordBlock = textarea ? textarea.closest('div').parentElement : null;
    const chipWrap = keywordBlock ? keywordBlock.querySelector('.mt-3.flex.flex-wrap.gap-2') : null;

    if (autoBanToggle) {
      autoBanToggle.checked = Boolean(selectedScope.autoBanSpam);
    }

    if (muteNewToggle) {
      muteNewToggle.checked = Boolean(selectedScope.muteNewMembers);
    }

    let scopeRow = protectionCard.querySelector('#moderation-scope-row');
    if (!scopeRow) {
      scopeRow = document.createElement('div');
      scopeRow.id = 'moderation-scope-row';
      scopeRow.className = 'mb-6';
      protectionCard.querySelector('.space-y-8').insertBefore(scopeRow, protectionCard.querySelector('.space-y-8').firstChild);
    }

    scopeRow.innerHTML = \`
      <label class="block text-sm font-bold text-on-surface mb-3">Phạm vi áp dụng rule</label>
      <div class="grid grid-cols-1 gap-3">
        <select id="moderation-scope-select" class="bg-surface-container-low border-none rounded-xl text-xs font-semibold px-4 py-3 focus:ring-2 focus:ring-primary shadow-sm cursor-pointer">
          \${state.scopes.map(function(scope) {
            return '<option value="' + escapeHtml(scope.scopeKey) + '"' + (scope.scopeKey === selectedScope.scopeKey ? ' selected' : '') + '>' + escapeHtml(scope.scopeLabel + (scope.inheritsFromGlobal ? ' • đang dùng mặc định' : ' • có cấu hình riêng')) + '</option>';
          }).join('')}
        </select>
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-xl bg-surface-container-low px-4 py-3">
            <div class="text-[10px] uppercase tracking-[0.12em] text-on-surface-variant font-black">Mute thành viên mới</div>
            <input id="moderation-mute-hours" type="number" min="1" max="168" value="\${escapeHtml(String(selectedScope.muteDurationHours || 24))}" class="mt-2 w-full bg-transparent border-none p-0 text-sm font-bold text-on-surface focus:ring-0" />
          </div>
          <div class="rounded-xl bg-surface-container-low px-4 py-3 text-[11px] text-on-surface-variant leading-relaxed">
            <div class="font-black uppercase tracking-[0.12em] text-[10px] mb-2">Rule mặc định</div>
            Link, domain rủi ro, username đáng ngờ, social phrase và ngưỡng điểm luôn được áp dụng.
          </div>
        </div>
      </div>
    \`;

    const scopeSelect = document.getElementById('moderation-scope-select');
    if (scopeSelect && !scopeSelect.dataset.boundChange) {
      scopeSelect.dataset.boundChange = 'true';
      scopeSelect.addEventListener('change', function(event) {
        state.selectedScopeKey = event.target.value;
        renderConfigPanel();
      });
    }

    if (textarea) {
      textarea.placeholder = 'Nhập keyword cần thêm, cách nhau bằng dấu phẩy hoặc xuống dòng...';
      textarea.value = '';
      textarea.rows = 3;
    }

    if (chipWrap) {
      chipWrap.innerHTML = [
        selectedScope.keywords.map(function(keyword) {
          return \`
            <button data-keyword-id="\${escapeHtml(keyword.id)}" class="bg-error-container/20 text-error text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
              \${escapeHtml(keyword.value)}
              <span class="material-symbols-outlined text-[10px]">close</span>
            </button>
          \`;
        }).join(''),
        '<button id="moderation-add-keywords" class="text-[10px] font-bold text-primary px-2 py-1">+ Thêm keyword</button>',
      ].join('');
      bindKeywordButtons(chipWrap, textarea);
    }

    let domainBlock = protectionCard.querySelector('#moderation-domain-block');
    if (!domainBlock && actionButton) {
      domainBlock = document.createElement('div');
      domainBlock.id = 'moderation-domain-block';
      domainBlock.className = 'rounded-xl bg-surface-container-low px-4 py-4';
      actionButton.parentElement.insertBefore(domainBlock, actionButton);
    }

    if (domainBlock) {
      const domains = Array.isArray(selectedScope.domains) ? selectedScope.domains : [];
      domainBlock.innerHTML = \`
        <div class="text-sm font-bold text-on-surface mb-3">Domain block / allow</div>
        <div class="grid grid-cols-[1fr_auto_auto] gap-2">
          <input id="moderation-domain-input" class="bg-surface-container-lowest border-none rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary" placeholder="Nhập domain, ví dụ bit.ly" />
          <select id="moderation-domain-mode" class="bg-surface-container-lowest border-none rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-primary">
            <option value="BLOCK">Block</option>
            <option value="ALLOW">Allow</option>
          </select>
          <button id="moderation-add-domain" class="rounded-xl bg-primary text-on-primary px-3 py-2 text-xs font-bold">Thêm</button>
        </div>
        <div id="moderation-domain-wrap" class="mt-3 flex flex-wrap gap-2">
          \${domains.map(function(domain) {
            var tone = domain.mode === 'ALLOW'
              ? 'bg-tertiary/10 text-tertiary'
              : 'bg-error-container/20 text-error';
            return '<button data-domain-id="' + escapeHtml(domain.id) + '" class="' + tone + ' text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">' + escapeHtml(domain.mode + ': ' + domain.value) + '<span class="material-symbols-outlined text-[10px]">close</span></button>';
          }).join('') || '<span class="text-[11px] text-on-surface-variant">Scope này chưa có domain riêng, đang dùng built-in/global.</span>'}
        </div>
      \`;
      bindDomainButtons(
        domainBlock.querySelector('#moderation-domain-wrap'),
        domainBlock.querySelector('#moderation-domain-input'),
        domainBlock.querySelector('#moderation-domain-mode')
      );
    }

    let builtInBlock = protectionCard.querySelector('#moderation-built-in-summary');
    if (!builtInBlock && actionButton) {
      builtInBlock = document.createElement('div');
      builtInBlock.id = 'moderation-built-in-summary';
      builtInBlock.className = 'mt-6 rounded-xl bg-surface-container-low px-4 py-4 text-[11px] text-on-surface-variant leading-relaxed';
      actionButton.parentElement.insertBefore(builtInBlock, actionButton);
    }

    if (builtInBlock) {
      builtInBlock.innerHTML = \`
        <div class="text-[10px] uppercase tracking-[0.12em] font-black text-on-surface mb-2">Built-in rules đang bật</div>
        <div>Keyword mặc định: \${escapeHtml(String((state.builtInRules.keywords || []).slice(0, 5).join(', ')))}\${(state.builtInRules.keywords || []).length > 5 ? '...' : ''}</div>
        <div class="mt-1">Domain rủi ro: \${escapeHtml(String((state.builtInRules.riskyDomains || []).join(', ')))}</div>
        <div class="mt-1">Ngưỡng: Review \${escapeHtml(String((state.builtInRules.decisionThresholds || {}).review || 40))} / Warn \${escapeHtml(String((state.builtInRules.decisionThresholds || {}).warn || 60))} / Restrict \${escapeHtml(String((state.builtInRules.decisionThresholds || {}).restrict || 75))} / Ban \${escapeHtml(String((state.builtInRules.decisionThresholds || {}).ban || 90))}</div>
      \`;
    }

    let statusNode = protectionCard.querySelector('#moderation-policy-status');
    if (!statusNode && actionButton) {
      statusNode = document.createElement('div');
      statusNode.id = 'moderation-policy-status';
      statusNode.className = 'rounded-xl px-4 py-3 text-sm font-medium bg-surface-container-low text-on-surface-variant';
      actionButton.parentElement.insertBefore(statusNode, actionButton);
    }

    if (statusNode) {
      showInlineStatus(
        statusNode,
        selectedScope.inheritsFromGlobal
          ? 'Scope này đang dùng cấu hình mặc định toàn hệ thống. Bạn có thể lưu để tạo override riêng.'
          : 'Scope này đang có cấu hình anti-spam riêng.',
        selectedScope.inheritsFromGlobal ? 'warning' : 'success'
      );
    }

    if (actionButton && !actionButton.dataset.boundSavePolicy) {
      actionButton.dataset.boundSavePolicy = 'true';
      actionButton.textContent = 'Lưu cấu hình anti-spam';
      actionButton.addEventListener('click', savePolicy);
    }
  }

  patchPageMode();
  renderThreatCard();
  if (pageMode === 'moderation') {
    renderMemberTable();
    return;
  }
  renderLogSection();
  renderConfigPanel();
  renderSystemLogSection();
}
`;
}
