import { readFileSync } from "node:fs";
import path from "node:path";
import { getAutopostHydrator } from "./stitch-runtime/autopost";
import { getCampaignsHydrator } from "./stitch-runtime/campaigns";
import { getDashboardHydrator } from "./stitch-runtime/dashboard";
import { getModerationHydrator } from "./stitch-runtime/moderation";
import { getRolesHydrator } from "./stitch-runtime/roles";
import { getSettingsHydrator } from "./stitch-runtime/settings";

export type StitchPageKey =
  | "dashboard"
  | "campaigns"
  | "campaign-detail"
  | "moderation"
  | "spam"
  | "autopost"
  | "roles"
  | "settings";

const stitchFileMap: Record<StitchPageKey, string> = {
  dashboard: "dashboard_t_ng_quan_vn",
  campaigns: "qu_n_l_chi_n_d_ch_vn",
  "campaign-detail": "chi_ti_t_chi_n_d_ch_vn",
  moderation: "qu_n_l_user_spam_vn",
  spam: "qu_n_l_user_spam_vn",
  autopost: "b_ng_autopost_vn",
  roles: "qu_n_l_ph_n_quy_n_vn",
  settings: "c_u_h_nh_h_th_ng_vn",
};

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "/api";

function decodeLegacyString(value: string) {
  if (!/(?:Ã.|Â.|Ä.|Æ.|áº.|á».|â.)/.test(value)) {
    return value;
  }

  try {
    const bytes = Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return decoded.includes("�") ? value : decoded;
  } catch {
    return value;
  }
}

function getHydrationScript(page: StitchPageKey) {
  switch (page) {
    case "dashboard":
      return getDashboardHydrator();
    case "campaigns":
      return getCampaignsHydrator();
    case "moderation":
      return getModerationHydrator("moderation");
    case "spam":
      return getModerationHydrator("spam");
    case "roles":
      return getRolesHydrator();
    case "autopost":
      return getAutopostHydrator();
    case "settings":
      return getSettingsHydrator();
    default:
      return "";
  }
}

function injectBridgeScript(html: string, page: StitchPageKey) {
  const hydrationScript = decodeLegacyString(getHydrationScript(page));

  const bridgeScript = `
<script>
(function() {
  const AUTH_KEY = 'telegram-ops-access-token';
  const API_BASE = ${JSON.stringify(apiBaseUrl)};
  const routeByIcon = {
    dashboard: '/dashboard',
    mail: '/campaigns',
    security: '/moderation',
    gpp_maybe: '/spam',
    schedule: '/autopost',
    verified_user: '/roles',
    settings: '/settings',
  };
  const pagePermissionMap = {
    dashboard: [],
    campaigns: ['campaign.manage', 'campaign.view'],
    moderation: ['moderation.review', 'settings.manage'],
    spam: ['moderation.review', 'settings.manage'],
    autopost: ['autopost.execute'],
    roles: ['workspace.manage'],
    contacts: ['contacts.manage', 'workspace.manage'],
    settings: ['settings.manage'],
  };
  const eventIconMap = {
    primary: 'notifications_active',
    success: 'check_circle',
    warning: 'warning',
    danger: 'report',
  };
  const eventShellMap = {
    primary: { wrap: 'bg-primary/10 text-primary', badge: 'bg-primary/10 text-primary' },
    success: { wrap: 'bg-tertiary/10 text-tertiary', badge: 'bg-tertiary/10 text-tertiary' },
    warning: { wrap: 'bg-secondary-container text-on-secondary-container', badge: 'bg-secondary-container text-on-secondary-container' },
    danger: { wrap: 'bg-error/10 text-error', badge: 'bg-error/10 text-error' },
  };
  const statusLabelMap = {
    primary: 'Đã ghi nhận',
    success: 'Hoàn tất',
    warning: 'Cần xem',
    danger: 'Khẩn cấp',
  };
  const campaignStatusShellMap = {
    Active: {
      mode: 'bg-primary-container text-on-primary-container uppercase',
      progress: 'bg-primary',
      status: 'text-tertiary',
      dot: 'bg-tertiary',
    },
    Review: {
      mode: 'bg-secondary-container text-on-secondary-container uppercase',
      progress: 'bg-primary/60',
      status: 'text-on-surface-variant',
      dot: 'bg-on-surface-variant',
    },
    Paused: {
      mode: 'bg-error-container/20 text-error uppercase',
      progress: 'bg-error/80',
      status: 'text-error',
      dot: 'bg-error',
    },
  };
  const knownPermissionCatalog = [
    { code: 'workspace.manage', label: 'Quản lý nhân sự và phân quyền trong workspace' },
    { code: 'campaign.view', label: 'Xem campaign được giao và kết quả cá nhân' },
    { code: 'campaign.manage', label: 'Quản lý campaign và invite link' },
    { code: 'moderation.review', label: 'Review spam và moderation' },
    { code: 'settings.manage', label: 'Quản lý cấu hình và bảo mật' },
    { code: 'autopost.execute', label: 'Điều phối autopost và logs' },
    { code: 'contacts.manage', label: 'Import contacts va resolve Telegram IDs' },
  ];

  function getToken() {
    try {
      return window.localStorage.getItem(AUTH_KEY) || window.parent.localStorage.getItem(AUTH_KEY);
    } catch (error) {
      return null;
    }
  }

  function uniqueValues(values) {
    return Array.from(new Set(values));
  }

  function compactId(value) {
    return String(value || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || 'LIVE';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function decodeLegacyRuntimeString(value) {
    const text = String(value ?? '');
    if (!/(?:Ã.|Ä.|Æ.|áº.|á».|â€)/.test(text)) {
      return text;
    }

    try {
      const bytes = Uint8Array.from(Array.from(text).map(function(char) {
        return char.charCodeAt(0);
      }));
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      return decoded.includes('�') ? text : decoded;
    } catch (error) {
      return text;
    }
  }

  function shouldSkipTextNormalization(node) {
    if (!node || !node.parentElement) {
      return false;
    }

    const parent = node.parentElement;
    if (parent.closest('.material-symbols-outlined')) {
      return true;
    }

    const tagName = parent.tagName;
    return tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT';
  }

  function normalizeElementAttributes(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    ['placeholder', 'title', 'aria-label'].forEach(function(attribute) {
      const currentValue = element.getAttribute(attribute);
      if (!currentValue) {
        return;
      }

      const normalizedValue = decodeLegacyRuntimeString(currentValue);
      if (normalizedValue !== currentValue) {
        element.setAttribute(attribute, normalizedValue);
      }
    });
  }

  function normalizeDomText(root) {
    const target = root || document.body;
    if (!target) {
      return;
    }

    if (target.nodeType === Node.TEXT_NODE) {
      if (!shouldSkipTextNormalization(target)) {
        const normalizedText = decodeLegacyRuntimeString(target.textContent || '');
        if (normalizedText !== target.textContent) {
          target.textContent = normalizedText;
        }
      }
      return;
    }

    if (target.nodeType !== Node.ELEMENT_NODE && target.nodeType !== Node.DOCUMENT_NODE) {
      return;
    }

    if (target.nodeType === Node.ELEMENT_NODE) {
      normalizeElementAttributes(target);
    }

    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const currentNode = walker.currentNode;

      if (currentNode.nodeType === Node.TEXT_NODE) {
        if (shouldSkipTextNormalization(currentNode)) {
          continue;
        }

        const originalText = currentNode.textContent || '';
        const normalizedText = decodeLegacyRuntimeString(originalText);
        if (normalizedText !== originalText) {
          currentNode.textContent = normalizedText;
        }
        continue;
      }

      if (currentNode.nodeType === Node.ELEMENT_NODE) {
        normalizeElementAttributes(currentNode);
      }
    }
  }

  function observeTextNormalization() {
    if (!document.body || document.body.dataset.textNormalizationBound) {
      return;
    }

    document.body.dataset.textNormalizationBound = 'true';
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === 'characterData') {
          normalizeDomText(mutation.target);
          return;
        }

        if (mutation.type === 'attributes' && mutation.target) {
          normalizeElementAttributes(mutation.target);
          return;
        }

        mutation.addedNodes.forEach(function(node) {
          normalizeDomText(node);
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label'],
    });
  }

  function normalizePayload(value) {
    if (typeof value === 'string') {
      return decodeLegacyRuntimeString(value);
    }

    if (Array.isArray(value)) {
      return value.map(function(item) {
        return normalizePayload(item);
      });
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(function(entry) {
          return [entry[0], normalizePayload(entry[1])];
        }),
      );
    }

    return value;
  }

  function setText(element, value) {
    if (element) {
      element.textContent = decodeLegacyRuntimeString(String(value ?? ''));
    }
  }

  function showBanner(message, tone) {
    const main = document.querySelector('main');
    if (!main) {
      return;
    }

    let banner = document.getElementById('nexus-live-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'nexus-live-banner';
      banner.className = 'mb-6 rounded-xl border px-4 py-3 text-sm font-semibold';
      main.insertBefore(banner, main.firstChild);
    }

    const toneClassMap = {
      success: 'border-tertiary/20 bg-tertiary/10 text-tertiary',
      warning: 'border-secondary-container bg-secondary-container/50 text-on-secondary-container',
      danger: 'border-error/20 bg-error/10 text-error',
      info: 'border-primary/20 bg-primary/10 text-primary',
    };

    banner.className = 'mb-6 rounded-xl border px-4 py-3 text-sm font-semibold ' + (toneClassMap[tone] || toneClassMap.info);
    banner.textContent = decodeLegacyRuntimeString(message);
  }

  function showInlineStatus(element, message, tone) {
    if (!element) {
      return;
    }

    const toneClassMap = {
      success: 'rounded-xl px-4 py-3 text-sm font-medium bg-tertiary/10 text-tertiary',
      warning: 'rounded-xl px-4 py-3 text-sm font-medium bg-secondary-container/60 text-on-secondary-container',
      danger: 'rounded-xl px-4 py-3 text-sm font-medium bg-error/10 text-error',
    };

    element.className = toneClassMap[tone] || toneClassMap.success;
    element.textContent = decodeLegacyRuntimeString(message);
  }

  function triggerDownload(filename, contents, mimeType) {
    const blob = new Blob([contents], {
      type: mimeType || 'application/octet-stream',
    });
    const targetWindow = window.top && window.top !== window ? window.top : window;
    const targetDocument = targetWindow.document || document;
    const urlApi = targetWindow.URL || window.URL;
    const href = urlApi.createObjectURL(blob);
    const link = targetDocument.createElement('a');

    link.href = href;
    link.download = filename;
    link.style.display = 'none';
    targetDocument.body.appendChild(link);
    link.click();

    window.setTimeout(function() {
      link.remove();
      urlApi.revokeObjectURL(href);
    }, 1000);
  }

  function collectIpWhitelist(tableBody) {
    if (!tableBody) {
      return '';
    }

    return Array.from(tableBody.querySelectorAll('tr'))
      .map(function(row) {
        const cells = row.querySelectorAll('td');
        const ip = cells[0] ? String(cells[0].textContent || '').trim() : '';
        const note = cells[1] ? String(cells[1].textContent || '').trim() : '';
        return ip ? ip + '|' + note : '';
      })
      .filter(Boolean)
      .join('\\n');
  }

  async function fetchJson(path, init) {
    const headers = new Headers((init && init.headers) || {});
    const token = getToken();
    if (token) {
      headers.set('Authorization', 'Bearer ' + token);
    }
    if (init && init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(API_BASE + path, Object.assign({}, init || {}, {
      cache: 'no-store',
      headers: headers,
    }));

    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const error = new Error('Request failed with status ' + response.status);
      error.status = response.status;
      error.body = body;
      throw error;
    }

    return normalizePayload(body);
  }

  function getPageKeyByRoute(route) {
    switch (route) {
      case '/dashboard':
        return 'dashboard';
      case '/campaigns':
        return 'campaigns';
      case '/moderation':
        return 'moderation';
      case '/spam':
        return 'spam';
      case '/autopost':
        return 'autopost';
      case '/roles':
        return 'roles';
      case '/settings':
        return 'settings';
      default:
        return null;
    }
  }

  function canAccessRoute(route, permissions) {
    const pageKey = getPageKeyByRoute(route);
    if (!pageKey) {
      return true;
    }

    const requiredPermissions = pagePermissionMap[pageKey] || [];
    if (!requiredPermissions.length) {
      return true;
    }

    const userPermissions = Array.isArray(permissions) ? permissions : [];
    return requiredPermissions.some(function(permission) {
      return userPermissions.includes(permission);
    });
  }

  function patchNavigation(userPermissions) {
    const currentPath = (window.top && window.top.location ? window.top.location.pathname : window.location.pathname) || '';

    document.querySelectorAll('a[href="#"]').forEach(function(anchor) {
      const iconElement = anchor.querySelector('.material-symbols-outlined');
      const iconName = String((iconElement && (iconElement.getAttribute('data-icon') || iconElement.textContent)) || '').trim();
      const text = String(anchor.textContent || '').trim();
      let route = routeByIcon[iconName];

      if (!route) {
        if (/Tổng quan|Bảng điều khiển/i.test(text)) route = '/dashboard';
        else if (/Chiến dịch/i.test(text)) route = '/campaigns';
        else if (/Spam/i.test(text)) route = '/moderation';
        else if (/Autopost/i.test(text)) route = '/autopost';
        else if (/Phân quyền/i.test(text)) route = '/roles';
        else if (/Cài đặt/i.test(text)) route = '/settings';
      }

      if (route) {
        anchor.setAttribute('href', route);
        anchor.setAttribute('target', '_top');
      }
    });

    const sidebarNav = document.querySelector('aside nav');
    const moderationAnchor = sidebarNav
      ? Array.from(sidebarNav.querySelectorAll('a')).find(function(anchor) {
          const icon = anchor.querySelector('.material-symbols-outlined');
          return String(icon && (icon.getAttribute('data-icon') || icon.textContent) || '').trim() === 'security';
        })
      : null;

    if (moderationAnchor && !sidebarNav.dataset.spamSplit) {
      sidebarNav.dataset.spamSplit = 'true';
      moderationAnchor.setAttribute('href', '/moderation');
      moderationAnchor.setAttribute('target', '_top');
      moderationAnchor.innerHTML = '<span class="material-symbols-outlined" data-icon="security">security</span>Người dùng';

      const spamAnchor = moderationAnchor.cloneNode(true);
      spamAnchor.setAttribute('href', '/spam');
      spamAnchor.innerHTML = '<span class="material-symbols-outlined" data-icon="gpp_maybe">gpp_maybe</span>Spam';
      moderationAnchor.insertAdjacentElement('afterend', spamAnchor);
    }

    if (sidebarNav) {
      Array.from(sidebarNav.querySelectorAll('a')).forEach(function(anchor) {
        const href = anchor.getAttribute('href') || '';
        if (!canAccessRoute(href, userPermissions)) {
          anchor.remove();
          return;
        }

        const isActive = href === currentPath;
        anchor.className = isActive
          ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-sm rounded-lg mx-2 px-4 py-3 flex items-center gap-3 transition-all duration-200 ease-in-out text-sm font-semibold'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 px-4 py-3 mx-2 flex items-center gap-3 transition-all duration-200 ease-in-out hover:bg-slate-200/50 dark:hover:bg-slate-800/50 rounded-lg text-sm font-medium';
      });
    }

    Array.from(document.querySelectorAll('header a[href], nav a[href]')).forEach(function(anchor) {
      const href = anchor.getAttribute('href') || '';
      if (!href || href === '#' || anchor.closest('aside nav')) {
        return;
      }

      if (!canAccessRoute(href, userPermissions)) {
        anchor.remove();
      }
    });

    Array.from(document.querySelectorAll('button')).forEach(function(button) {
      if (/Tạo chiến dịch mới/i.test(String(button.textContent || ''))) {
        button.addEventListener('click', function() {
          window.top.location.href = '/campaigns';
        });
      }
    });
  }

  function patchBranding() {
    const topNav = document.querySelector('nav');
    const topNavLeft = topNav ? topNav.querySelector('div') : null;
    const topBrand = topNavLeft ? topNavLeft.querySelector('span') : null;
    const sidebar = document.querySelector('aside');
    const sidebarBrand = sidebar ? sidebar.querySelector(':scope > div') : null;

    if (sidebarBrand) {
      sidebarBrand.remove();
    }

    if (topBrand) {
      topBrand.textContent = 'Telegram Command Center';
      topBrand.className = 'text-lg font-black tracking-tight text-slate-900 dark:text-slate-50 shrink-0';
    } else if (topNavLeft) {
      const brand = document.createElement('span');
      brand.textContent = 'Telegram Command Center';
      brand.className = 'text-lg font-black tracking-tight text-slate-900 dark:text-slate-50 shrink-0';
      topNavLeft.insertBefore(brand, topNavLeft.firstChild || null);
    }

    if (topNavLeft) {
      topNavLeft.classList.remove('gap-8');
      topNavLeft.classList.add('gap-4', 'min-w-0');
    }
  }

  function bindLogout() {
    document.addEventListener('click', function(event) {
      const button = event.target.closest('button');
      if (!button) {
        return;
      }

      const icon = button.querySelector('[data-icon="logout"], .material-symbols-outlined');
      const iconText = icon ? String(icon.getAttribute('data-icon') || icon.textContent || '').trim() : '';
      if (iconText !== 'logout') {
        return;
      }

      try {
        window.parent.localStorage.removeItem(AUTH_KEY);
        window.localStorage.removeItem(AUTH_KEY);
      } catch (error) {}
      window.top.location.href = '/';
    });
  }

  ${hydrationScript}

  async function hydratePage() {
    switch (${JSON.stringify(page)}) {
      case 'dashboard':
        return hydrateDashboard();
      case 'campaigns':
        return hydrateCampaigns();
      case 'moderation':
        return hydrateModeration();
      case 'spam':
        return hydrateModeration();
      case 'roles':
        return hydrateRoles();
      case 'autopost':
        return hydrateAutopost();
      case 'settings':
        return hydrateSettings();
      default:
        return Promise.resolve();
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    observeTextNormalization();
    patchBranding();
    bindLogout();
    fetchJson('/auth/me')
      .then(function(profile) {
        patchNavigation(profile && Array.isArray(profile.permissions) ? profile.permissions : []);
        return hydratePage();
      })
      .catch(function(error) {
        patchNavigation([]);
        if (error && error.status === 403) {
          showBanner('Tài khoản hiện tại không có quyền truy cập dữ liệu live của trang này.', 'warning');
          return;
        }

        console.error(error);
        showBanner('Không tải được dữ liệu live. Layout stitch vẫn được giữ nguyên để tiếp tục kiểm tra UI.', 'danger');
      });
  });
  window.addEventListener('load', function() {
    observeTextNormalization();
    normalizeDomText(document.body);
  });
})();
</script>
`;

  return html.replace("</body>", `${decodeLegacyString(bridgeScript)}</body>`);
}

export function getStitchPageHtml(page: StitchPageKey) {
  const filePath = path.join(
    process.cwd(),
    "..",
    "..",
    "stitch",
    stitchFileMap[page],
    "code.html",
  );

  const rawHtml = readFileSync(filePath, "utf8");

  return injectBridgeScript(rawHtml, page);
}
