export function getSettingsHydrator() {
  return `
async function hydrateSettings() {
  const results = await Promise.all([fetchJson('/settings'), fetchJson('/telegram/status')]);
  const settingsList = Array.isArray(results[0]) ? results[0] : [];
  const telegramStatus = results[1];
  const settings = {};

  settingsList.forEach(function(item) {
    settings[item.key] = item.value;
  });

  const main = document.querySelector('main');
  const sections = main ? main.querySelectorAll('section') : [];
  const generalSection = sections[0];
  const securitySection = sections[1];
  const appearanceSection = sections[2];
  const notificationsSection = sections[3];
  const systemNameInput = generalSection && generalSection.querySelector('input[type="text"]');
  const botTokenInput = generalSection && generalSection.querySelector('input[type="password"]');
  const twoFaInput = securitySection && securitySection.querySelector('input[type="checkbox"]');
  const ipTableBody = securitySection && securitySection.querySelector('tbody');
  const languageSelect = appearanceSection && appearanceSection.querySelector('select');
  const notificationInputs = notificationsSection ? notificationsSection.querySelectorAll('input[type="checkbox"]') : [];
  const saveButton = main && Array.from(main.querySelectorAll('button')).find(function(button) {
    return /Lưu cấu hình|LÆ°u cáº¥u hÃ¬nh|save/i.test(String(button.textContent || ''));
  });

  if (systemNameInput) {
    systemNameInput.value = settings['system.name'] || 'Telegram Operations Platform';
  }

  if (botTokenInput) {
    botTokenInput.value = '';
    botTokenInput.placeholder = telegramStatus.tokenPreview || 'ChÆ°a cáº¥u hÃ¬nh bot token';
  }

  if (twoFaInput) {
    twoFaInput.checked = String(settings['security.2fa'] || '').includes('required');
  }

  if (languageSelect) {
    languageSelect.value = settings['ui.language'] === 'en' ? 'English' : 'Tiáº¿ng Viá»‡t';
  }

  if (notificationInputs.length >= 4) {
    notificationInputs[0].checked = settings['notifications.spam_alerts'] !== 'false';
    notificationInputs[1].checked = settings['notifications.campaign_reports'] !== 'false';
    notificationInputs[2].checked = settings['notifications.unknown_ip'] !== 'false';
    notificationInputs[3].checked = settings['notifications.system_critical'] !== 'false';
  }

  if (ipTableBody) {
    ipTableBody.innerHTML = String(settings['security.ip_whitelist'] || '192.168.1.1|VÄƒn phÃ²ng chÃ­nh\\n42.115.32.11|Home Network')
      .split(/\\r?\\n/)
      .map(function(line) {
        return line.trim();
      })
      .filter(Boolean)
      .map(function(entry, index) {
        const parts = entry.split('|');
        return \`
          <tr class="\${index % 2 === 1 ? 'bg-surface-container/30' : ''}">
            <td class="px-6 py-4 text-sm font-mono font-medium">\${escapeHtml(parts[0] || '0.0.0.0')}</td>
            <td class="px-6 py-4 text-sm text-on-surface-variant">\${escapeHtml(parts[1] || 'KhÃ´ng cÃ³ ghi chÃº')}</td>
            <td class="px-6 py-4 text-right">
              <button class="text-on-surface-variant hover:bg-surface-container-high p-1.5 rounded-lg transition-colors" type="button">
                <span class="material-symbols-outlined text-sm">visibility</span>
              </button>
            </td>
          </tr>
        \`;
      })
      .join('');
  }

  let aiSection = main && main.querySelector('[data-ai-settings-section]');
  if (!aiSection && generalSection) {
    aiSection = document.createElement('section');
    aiSection.setAttribute('data-ai-settings-section', 'true');
    aiSection.className = 'bg-surface-container-lowest rounded-xl p-8 shadow-[0_8px_32px_rgba(42,52,57,0.04)]';
    aiSection.innerHTML = [
      '<div class="flex items-center gap-3 mb-8 border-b border-outline-variant/10 pb-4">',
      '<span class="material-symbols-outlined text-primary text-2xl">smart_toy</span>',
      '<h2 class="text-xl font-bold tracking-tight">Cấu hình AI</h2>',
      '</div>',
      '<div class="space-y-6">',
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">',
      '<div class="space-y-2 md:col-span-2">',
      '<label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant block">AI Base URL</label>',
      '<input data-ai-base-url class="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20 text-on-surface font-medium transition-all" type="text" placeholder="https://your-ai-endpoint.com/v1" />',
      '</div>',
      '<div class="space-y-2">',
      '<label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant block">API Token</label>',
      '<input data-ai-token class="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20 text-on-surface font-mono transition-all" type="password" placeholder="Dán token AI tại đây" />',
      '</div>',
      '<div class="space-y-2">',
      '<label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant block">Model</label>',
      '<div class="flex gap-3">',
      '<select data-ai-model class="flex-1 bg-surface-container-low border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20 text-on-surface font-medium appearance-none"></select>',
      '<button data-ai-load-models class="shrink-0 rounded-xl bg-primary text-white px-4 py-3 text-sm font-bold shadow-md" type="button">Load models</button>',
      '</div>',
      '</div>',
      '</div>',
      '<div class="space-y-2">',
      '<label class="text-xs font-bold uppercase tracking-wider text-on-surface-variant block">Prompt hệ thống</label>',
      '<textarea data-ai-prompt class="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20 text-on-surface font-medium transition-all outline-none resize-none" rows="6" placeholder="Nhập prompt hệ thống cho AI moderation..."></textarea>',
      '</div>',
      '<div data-ai-status class="hidden rounded-xl px-4 py-3 text-sm font-medium"></div>',
      '</div>',
    ].join('');
    generalSection.insertAdjacentElement('afterend', aiSection);
  }

  const aiBaseUrlInput = aiSection && aiSection.querySelector('[data-ai-base-url]');
  const aiTokenInput = aiSection && aiSection.querySelector('[data-ai-token]');
  const aiModelSelect = aiSection && aiSection.querySelector('[data-ai-model]');
  const aiPromptInput = aiSection && aiSection.querySelector('[data-ai-prompt]');
  const aiLoadButton = aiSection && aiSection.querySelector('[data-ai-load-models]');
  const aiStatus = aiSection && aiSection.querySelector('[data-ai-status]');

  const currentAiModels = [];

  function renderModelOptions(models, preferredModel) {
    if (!aiModelSelect) {
      return;
    }

    aiModelSelect.innerHTML = models
      .map(function(model) {
        const id = String(model.id || '');
        const label = String(model.label || id);
        return '<option value="' + escapeHtml(id) + '">' + escapeHtml(label) + '</option>';
      })
      .join('');

    if (preferredModel) {
      aiModelSelect.value = preferredModel;
      if (aiModelSelect.value !== preferredModel && aiModelSelect.options.length) {
        aiModelSelect.selectedIndex = 0;
      }
    }
  }

  if (aiBaseUrlInput) {
    aiBaseUrlInput.value = settings['ai.base_url'] || 'https://v98store.com/v1';
  }

  if (aiTokenInput) {
    aiTokenInput.value = '';
    aiTokenInput.placeholder = settings['ai.api_token'] ? 'Token AI đã được lưu' : 'Dán token AI tại đây';
  }

  if (aiPromptInput) {
    aiPromptInput.value = settings['ai.prompt'] || 'Bạn là AI moderation assistant cho nền tảng Telegram operations. Ưu tiên an toàn, trả nhãn ngắn gọn và nêu lý do rõ ràng.';
  }

  currentAiModels.push(
    {
      id: settings['ai.model'] || 'nexus-guard-mini',
      label: settings['ai.model'] || 'nexus-guard-mini',
    },
  );
  renderModelOptions(currentAiModels, settings['ai.model'] || 'nexus-guard-mini');

  if (aiLoadButton && !aiLoadButton.dataset.liveBound) {
    aiLoadButton.dataset.liveBound = 'true';
    aiLoadButton.addEventListener('click', async function() {
      const baseUrl = aiBaseUrlInput ? String(aiBaseUrlInput.value || '').trim() : '';
      const apiToken = aiTokenInput ? String(aiTokenInput.value || '').trim() : '';

      aiLoadButton.disabled = true;
      aiLoadButton.classList.add('opacity-70');

      try {
        const payload = await fetchJson('/settings/ai/models', {
          method: 'POST',
          body: JSON.stringify({
            baseUrl: baseUrl,
            apiToken: apiToken,
          }),
        });
        const models = Array.isArray(payload.models) ? payload.models : [];
        currentAiModels.splice(0, currentAiModels.length);
        models.forEach(function(model) {
          currentAiModels.push(model);
        });
        renderModelOptions(currentAiModels, settings['ai.model'] || (models[0] && models[0].id) || '');
        showInlineStatus(
          aiStatus,
          'Đã load ' + String(models.length) + ' model từ ' + String(payload.source || baseUrl || 'AI endpoint') + '.',
          'success'
        );
      } catch (error) {
        if (error && error.status === 403) {
          showInlineStatus(aiStatus, 'Tài khoản hiện tại không có quyền load model AI.', 'warning');
        } else {
          showInlineStatus(aiStatus, 'Không load được model AI. Kiểm tra base URL hoặc token.', 'danger');
        }
      } finally {
        aiLoadButton.disabled = false;
        aiLoadButton.classList.remove('opacity-70');
      }
    });
  }

  if (saveButton && !saveButton.dataset.liveBound) {
    saveButton.dataset.liveBound = 'true';
    saveButton.addEventListener('click', async function() {
      saveButton.disabled = true;
      saveButton.classList.add('opacity-70');

      try {
        await fetchJson('/settings', {
          method: 'PUT',
          body: JSON.stringify({
            entries: [
              { key: 'system.name', value: systemNameInput ? systemNameInput.value.trim() : 'Telegram Operations Platform' },
              { key: 'security.2fa', value: twoFaInput && twoFaInput.checked ? 'required-for-admins' : 'optional' },
              { key: 'ui.language', value: languageSelect && /English/i.test(languageSelect.value) ? 'en' : 'vi' },
              { key: 'notifications.spam_alerts', value: notificationInputs[0] && notificationInputs[0].checked ? 'true' : 'false' },
              { key: 'notifications.campaign_reports', value: notificationInputs[1] && notificationInputs[1].checked ? 'true' : 'false' },
              { key: 'notifications.unknown_ip', value: notificationInputs[2] && notificationInputs[2].checked ? 'true' : 'false' },
              { key: 'notifications.system_critical', value: notificationInputs[3] && notificationInputs[3].checked ? 'true' : 'false' },
              { key: 'security.ip_whitelist', value: collectIpWhitelist(ipTableBody) },
              { key: 'ai.model', value: aiModelSelect ? String(aiModelSelect.value || '').trim() : String(settings['ai.model'] || '') },
              { key: 'ai.prompt', value: aiPromptInput ? String(aiPromptInput.value || '').trim() : String(settings['ai.prompt'] || '') },
            ].concat(
              [
                { key: 'ai.base_url', value: aiBaseUrlInput ? String(aiBaseUrlInput.value || '').trim() : 'https://v98store.com/v1' },
              ],
              aiTokenInput && String(aiTokenInput.value || '').trim()
                ? [{ key: 'ai.api_token', value: String(aiTokenInput.value || '').trim() }]
                : []
            ),
          }),
        });

        const nextToken = botTokenInput ? botTokenInput.value.trim() : '';
        if (nextToken) {
          const config = await fetchJson('/telegram/config', {
            method: 'POST',
            body: JSON.stringify({ botToken: nextToken }),
          });
          if (botTokenInput) {
            botTokenInput.value = '';
            botTokenInput.placeholder = config.tokenPreview || 'Bot token Ä‘Ã£ cáº­p nháº­t';
          }
        }

        if (aiTokenInput) {
          aiTokenInput.value = '';
          aiTokenInput.placeholder = 'Token AI đã được lưu';
        }

        showBanner('Cấu hình hệ thống và AI đã được lưu vào API local.', 'success');
      } catch (error) {
        if (error && error.status === 403) {
          showBanner('Tài khoản hiện tại không có quyền quản lý settings.', 'warning');
        } else {
          showBanner('Không lưu được cấu hình. Kiểm tra API hoặc quyền truy cập.', 'danger');
        }
      } finally {
        saveButton.disabled = false;
        saveButton.classList.remove('opacity-70');
      }
    });
  }
}
`;
}
