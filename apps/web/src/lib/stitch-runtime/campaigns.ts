export function getCampaignsHydrator() {
  return `
async function hydrateCampaigns() {
  const mainGrid = document.querySelector('main > div.grid');
  if (!mainGrid) {
    return;
  }

  const formSection = mainGrid.children[0];
  const dataSection = mainGrid.children[1];
  const statsCard = formSection && formSection.children[1];
  const tableCard = dataSection && dataSection.children[0];
  const secondaryGrid = dataSection && dataSection.children[1];
  const searchInput = tableCard && tableCard.querySelector('input[type="text"]');
  const tableBody = tableCard && tableCard.querySelector('tbody');
  const footerRow = tableCard && Array.from(tableCard.querySelectorAll('.px-8.py-6')).find(function(section) {
    return /Đang hiển thị|Dang hien thi/i.test(String(section.textContent || ''));
  });
  const tableFooter = footerRow && footerRow.querySelector('span');
  const tableHeader = tableCard && tableCard.querySelector('.px-8.py-6.border-b');
  const tableHeaderActions = tableHeader && tableHeader.querySelector('.flex.items-center.gap-3');
  const form = formSection && formSection.querySelector('form');

  const results = await Promise.all([
    fetchJson('/campaigns'),
    fetchJson('/platform'),
    fetchJson('/telegram/groups').catch(function() {
      return { items: [] };
    }),
  ]);
  const liveCampaigns = Array.isArray(results[0]) ? results[0].slice() : [];
  const snapshot = results[1];
  const telegramGroups = Array.isArray(results[2] && results[2].items)
    ? results[2].items
    : [];
  const joinMetric = Array.isArray(snapshot.metrics)
    ? snapshot.metrics.find(function(metric) {
        return /join|user|ngu?i/i.test(String(metric.label || ''));
      })
    : null;

  if (tableHeader) {
    tableHeader.classList.add('flex-wrap', 'gap-4');
  }

  if (tableHeaderActions) {
    tableHeaderActions.classList.add('ml-auto', 'flex-wrap', 'justify-end');
  }

  if (statsCard && joinMetric) {
    setText(statsCard.querySelector('h3'), joinMetric.value || '--');
    const note = statsCard.querySelector('p');
    if (note) {
      note.textContent = 'Nguồn dữ liệu live từ API campaigns, Telegram groups và tracking invite link.';
    }
    const trend = statsCard.querySelector('span.text-tertiary');
    if (trend) {
      trend.textContent = String(joinMetric.trend || '--');
    }
  }

  const groupSelect = form && form.querySelector('select');
  if (groupSelect) {
    const groups = telegramGroups.length
      ? telegramGroups
      : uniqueValues(
          liveCampaigns.map(function(campaign) {
            return String(campaign.channel || '').trim();
          }).filter(Boolean),
        ).map(function(channel) {
          return { title: channel, externalId: channel };
        });

    groupSelect.innerHTML = ['<option value="">Chọn một kênh hoặc nhóm</option>']
      .concat(groups.map(function(group) {
        return '<option value="' + escapeHtml(group.externalId || '') + '" data-group-title="' + escapeHtml(group.title || '') + '">' + escapeHtml(group.title || '') + '</option>';
      }))
      .join('');
  }

  function renderCampaignTable(items) {
    if (!tableBody) {
      return;
    }

    tableBody.innerHTML = items
      .map(function(campaign, index) {
        const progress = Math.max(0, Math.min(100, Number(campaign.conversionRate || 0)));
        const statusKey = String(campaign.status || 'Active');
        const statusShell = campaignStatusShellMap[statusKey] || campaignStatusShellMap.Active;
        const joinMode =
          statusKey === 'Review'
            ? 'C?n duy?t'
            : statusKey === 'Paused'
              ? 'Đã dừng'
              : 'Tham gia trực tiếp';

        return \`
          <tr class="group hover:bg-surface-container-low transition-colors \${index % 2 === 1 ? 'bg-surface-container-low/20' : ''}" data-campaign-id="\${escapeHtml(campaign.id || '')}">
            <td class="px-8 py-5 text-xs font-mono text-on-surface-variant">#\${escapeHtml(compactId(campaign.id || String(index + 1)))}</td>
            <td class="px-6 py-5">
              <div class="flex flex-col">
                <span class="text-sm font-bold text-on-surface">\${escapeHtml(campaign.name || 'Campaign')}</span>
                <span class="text-[11px] text-blue-600 font-medium">\${escapeHtml(campaign.inviteCode || 't.me/+pending')}</span>
              </div>
            </td>
            <td class="px-6 py-5">
              <span class="text-xs font-medium text-on-surface-variant">\${escapeHtml(campaign.channel || 'Telegram Group')}</span>
            </td>
            <td class="px-6 py-5">
              <span class="text-[10px] font-bold py-1 px-2 rounded-full \${statusShell.mode}">\${joinMode}</span>
            </td>
            <td class="px-6 py-5">
              <div class="flex flex-col gap-1">
                <div class="flex justify-between text-[10px] font-bold">
                  <span>\${escapeHtml(campaign.joinRate || '0% conversion')}</span>
                  <span class="text-on-surface-variant">\${progress}%</span>
                </div>
                <div class="w-24 h-1 bg-surface-container rounded-full overflow-hidden">
                  <div class="h-full \${statusShell.progress}" style="width: \${progress}%"></div>
                </div>
              </div>
            </td>
            <td class="px-6 py-5">
              <span class="inline-flex items-center gap-1.5 text-xs font-semibold \${statusShell.status}">
                <span class="w-1.5 h-1.5 rounded-full \${statusShell.dot}"></span>
                \${escapeHtml(statusKey === 'Review' ? 'C?n duy?t' : statusKey === 'Paused' ? 'Tạm dừng' : 'Hoạt động')}
              </span>
            </td>
            <td class="px-8 py-5 text-right">
              <button class="text-on-surface-variant hover:text-primary transition-colors" type="button" data-open-campaign="\${escapeHtml(campaign.id || '')}">
                <span class="material-symbols-outlined text-xl">open_in_new</span>
              </button>
            </td>
          </tr>
        \`;
      })
      .join('');

    if (tableFooter) {
      tableFooter.textContent = 'Đang hiển thị ' + String(items.length) + ' chiến dịch live từ API.';
    }

    if (secondaryGrid) {
      const approvalCard = secondaryGrid.children[0];
      const insightCard = secondaryGrid.children[1];
      const approvalList = approvalCard && approvalCard.querySelector('.space-y-3');
      const reviewItems = items.filter(function(campaign) {
        return String(campaign.status) === 'Review';
      });

      if (approvalList) {
        approvalList.innerHTML = (reviewItems.length ? reviewItems : items.slice(0, 2))
          .slice(0, 2)
          .map(function(campaign) {
            return \`
              <div class="flex items-center justify-between p-3 bg-white/50 rounded-lg">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                    \${escapeHtml((campaign.name || 'C').slice(0, 1).toUpperCase())}
                  </div>
                  <div>
                    <p class="text-xs font-bold">\${escapeHtml(campaign.name || 'Campaign')}</p>
                    <p class="text-[10px] text-on-surface-variant">\${escapeHtml(campaign.channel || 'Telegram Group')}</p>
                  </div>
                </div>
                <button class="text-[10px] font-bold text-primary hover:underline" type="button" data-open-campaign="\${escapeHtml(campaign.id || '')}">
                  Mở
                </button>
              </div>
            \`;
          })
          .join('');
      }

      if (insightCard) {
        const body = insightCard.querySelector('p');
        const button = insightCard.querySelector('button');
        const activeCount = items.filter(function(campaign) {
          return String(campaign.status) === 'Active';
        }).length;
        if (body) {
          body.innerHTML =
            'Hiện có <strong class="text-on-secondary-container">' +
            String(activeCount) +
            ' chiến dịch đang hoạt động</strong> và ' +
            String(reviewItems.length) +
            ' chiến dịch chờ duyệt.';
        }
        if (button) {
          button.textContent = 'Xem dashboard live';
          button.addEventListener('click', function() {
            window.top.location.href = '/dashboard';
          });
        }
      }
    }
  }

  renderCampaignTable(liveCampaigns);

  if (tableBody && !tableBody.dataset.liveBound) {
    tableBody.dataset.liveBound = 'true';
    tableBody.addEventListener('click', function(event) {
      const target = event.target.closest('[data-open-campaign]');
      if (!target) {
        return;
      }

      const campaignId = target.getAttribute('data-open-campaign');
      if (campaignId) {
        window.top.location.href = '/campaigns/' + encodeURIComponent(campaignId);
      }
    });
  }

  if (searchInput && !searchInput.dataset.liveBound) {
    searchInput.dataset.liveBound = 'true';
    searchInput.addEventListener('input', function() {
      const keyword = String(searchInput.value || '').trim().toLowerCase();
      const filtered = !keyword
        ? liveCampaigns
        : liveCampaigns.filter(function(campaign) {
            return [campaign.name, campaign.channel, campaign.inviteCode, campaign.status]
              .join(' ')
              .toLowerCase()
              .includes(keyword);
          });

      renderCampaignTable(filtered);
    });
  }

  if (form && !form.dataset.liveBound) {
    form.dataset.liveBound = 'true';
    const nameInput = form.querySelector('input[type="text"]');
    const limitInput = form.querySelector('input[type="number"]');
    const approvalInput = form.querySelector('input[type="checkbox"]');
    const noteInput = form.querySelector('textarea');
    const submitButton = form.querySelector('button[type="submit"]');
    const statusBox = document.createElement('div');
    statusBox.className = 'hidden rounded-xl px-4 py-3 text-sm font-medium';
    form.appendChild(statusBox);

    form.addEventListener('submit', async function(event) {
      event.preventDefault();

      const name = nameInput ? String(nameInput.value || '').trim() : '';
      const selectedOption = groupSelect ? groupSelect.options[groupSelect.selectedIndex] : null;
      const channel = selectedOption ? String(selectedOption.getAttribute('data-group-title') || '').trim() : '';
      const groupExternalId = selectedOption ? String(selectedOption.value || '').trim() : '';
      const limit = limitInput ? String(limitInput.value || '').trim() : '';
      const note = noteInput ? String(noteInput.value || '').trim() : '';
      const requiresApproval = Boolean(approvalInput && approvalInput.checked);

      if (!name || !channel) {
        showInlineStatus(statusBox, 'Vui lòng nhập tên chiến dịch và chọn nhóm Telegram.', 'warning');
        return;
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.classList.add('opacity-70');
      }

      try {
        const created = await fetchJson('/campaigns', {
          method: 'POST',
          body: JSON.stringify({
            name: note ? name + ' • ' + note.slice(0, 24) : name,
            channel: channel,
            joinRate: limit ? 'Giới hạn ' + limit + ' thành viên' : '0% conversion',
            status: requiresApproval ? 'Review' : 'Active',
          }),
        });

        if (groupExternalId) {
          try {
            await fetchJson('/telegram/invite-links', {
              method: 'POST',
              body: JSON.stringify({
                campaignId: created.id,
                groupExternalId: groupExternalId,
                groupTitle: channel,
                name: name,
                memberLimit: limit ? Number(limit) : undefined,
                createsJoinRequest: requiresApproval,
                expireHours: 24 * 7,
              }),
            });
          } catch (inviteError) {
            console.error(inviteError);
          }
        }

        const refreshedCampaigns = await fetchJson('/campaigns');
        liveCampaigns.splice(0, liveCampaigns.length);
        refreshedCampaigns.forEach(function(item) {
          liveCampaigns.push(item);
        });

        renderCampaignTable(liveCampaigns);
        form.reset();
        if (groupSelect && groupSelect.options.length > 0) {
          groupSelect.selectedIndex = 0;
        }
        showInlineStatus(statusBox, 'Đã tạo chiến dịch. Nếu bot có quyền trên nhóm, link mời đã được tạo và gắn tracking.', 'success');
      } catch (error) {
        if (error && error.status === 403) {
          showInlineStatus(statusBox, 'Tài khoản hiện tại không có quyền tạo campaign.', 'danger');
        } else {
          showInlineStatus(statusBox, 'Không tạo được campaign. Kiểm tra API hoặc dữ liệu nhập.', 'danger');
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.classList.remove('opacity-70');
        }
      }
    });
  }
}
`;
}
