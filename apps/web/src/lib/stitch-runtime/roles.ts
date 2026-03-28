export function getRolesHydrator() {
  return `
async function hydrateRoles() {
  const results = await Promise.all([fetchJson('/roles'), fetchJson('/users')]);
  const roles = Array.isArray(results[0]) ? results[0] : [];
  const users = Array.isArray(results[1]) ? results[1].slice() : [];

  const mainGrid = document.querySelector('main > div.grid');
  const tableSection = mainGrid && mainGrid.children[0];
  const panelSection = mainGrid && mainGrid.children[1];
  const table = tableSection && tableSection.querySelector('table');
  const tableHeadings = table ? table.querySelectorAll('thead th') : [];
  const tableBody = table ? table.querySelector('tbody') : null;
  const totalBadge = tableSection && tableSection.querySelector('.flex.gap-2 span');
  const summaryCards = document.querySelector('main > section.mt-12');
  const headerButtons = document.querySelectorAll('header button');
  const primaryHeaderButton = Array.from(headerButtons).find(function(button) {
    return /Thêm|Vai trò/i.test(String(button.textContent || ''));
  });

  if (primaryHeaderButton) {
    primaryHeaderButton.innerHTML = '<span class="material-symbols-outlined text-[20px]">person_add</span>Thêm người dùng';
  }

  if (tableHeadings.length >= 4) {
    tableHeadings[0].textContent = 'Người dùng';
    tableHeadings[1].textContent = 'Vai trò';
    tableHeadings[2].textContent = 'Phòng ban';
    tableHeadings[3].textContent = 'Trạng thái';
  }

  if (totalBadge) {
    totalBadge.textContent = 'Tổng số ' + String(users.length) + ' người dùng';
  }

  let createUserCard = tableSection && tableSection.querySelector('[data-user-create-card]');
  if (!createUserCard && tableSection) {
    createUserCard = document.createElement('div');
    createUserCard.setAttribute('data-user-create-card', 'true');
    createUserCard.className = 'bg-surface-container-lowest rounded-3xl p-6 shadow-[0_8px_32px_rgba(42,52,57,0.04)] mb-6';
    createUserCard.innerHTML = [
      '<div class="flex items-center justify-between gap-4 mb-5">',
      '<div>',
      '<h3 class="font-bold text-lg">Tạo người dùng mới</h3>',
      '<p class="text-sm text-on-surface-variant">Tạo tài khoản nội bộ và gán vai trò ngay từ trang phân quyền.</p>',
      '</div>',
      '<div class="text-xs font-bold uppercase tracking-widest text-primary">Live API</div>',
      '</div>',
      '<form class="grid grid-cols-1 md:grid-cols-2 gap-4" data-user-create-form>',
      '<input class="rounded-xl bg-surface-container-low px-4 py-3 text-sm outline-none" name="name" placeholder="Họ tên người dùng" type="text" />',
      '<input class="rounded-xl bg-surface-container-low px-4 py-3 text-sm outline-none" name="email" placeholder="Email đăng nhập" type="email" />',
      '<input class="rounded-xl bg-surface-container-low px-4 py-3 text-sm outline-none" name="username" placeholder="Username nội bộ" type="text" />',
      '<input class="rounded-xl bg-surface-container-low px-4 py-3 text-sm outline-none" name="department" placeholder="Phòng ban" type="text" />',
      '<input class="rounded-xl bg-surface-container-low px-4 py-3 text-sm outline-none" name="password" placeholder="Mật khẩu tạm" type="password" />',
      '<select class="rounded-xl bg-surface-container-low px-4 py-3 text-sm outline-none" name="roleId"></select>',
      '<select class="rounded-xl bg-surface-container-low px-4 py-3 text-sm outline-none" name="status">',
      '<option value="ACTIVE">Hoạt động</option>',
      '<option value="AWAY">Vắng mặt</option>',
      '<option value="DISABLED">Tạm khóa</option>',
      '</select>',
      '<button class="rounded-xl bg-primary text-white font-bold px-5 py-3 shadow-md" type="submit">Tạo người dùng</button>',
      '</form>',
      '<div class="hidden mt-4 rounded-xl px-4 py-3 text-sm font-medium" data-user-create-status></div>',
    ].join('');
    tableSection.insertBefore(createUserCard, tableSection.firstChild || null);
  }

  const createForm = createUserCard && createUserCard.querySelector('[data-user-create-form]');
  const createStatus = createUserCard && createUserCard.querySelector('[data-user-create-status]');
  const roleSelect = createForm && createForm.querySelector('select[name="roleId"]');

  if (roleSelect) {
    roleSelect.innerHTML = roles
      .map(function(role) {
        return '<option value="' + escapeHtml(role.id || '') + '">' + escapeHtml(role.name || 'Role') + '</option>';
      })
      .join('');
  }

  function getRoleMeta(user) {
    return Array.isArray(user.roles) && user.roles.length ? user.roles[0] : null;
  }

  function renderPanel(user) {
    if (!panelSection || !user) {
      return;
    }

    const roleMeta = getRoleMeta(user);
    const card = panelSection.firstElementChild;
    const title = card && card.querySelector('p span.text-primary');
    if (title) {
      title.textContent = roleMeta ? roleMeta.name : 'Chưa gán vai trò';
    }

    const body = card && card.querySelector('.space-y-8');
    if (!body) {
      return;
    }

    const activePermissions = roleMeta && Array.isArray(roleMeta.permissions)
      ? roleMeta.permissions
      : [];

    const permissionItems = knownPermissionCatalog.map(function(item) {
      const enabled = activePermissions.includes(item.code);
      return \`
        <label class="flex items-center justify-between group cursor-default">
          <span class="text-sm font-medium">\${escapeHtml(item.label)}</span>
          <div class="relative inline-flex items-center">
            <input class="sr-only peer" type="checkbox" \${enabled ? 'checked' : ''} disabled />
            <div class="w-11 h-6 bg-surface-container-high rounded-full peer-checked:after:translate-x-full peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </div>
        </label>
      \`;
    }).join('');

    body.innerHTML = \`
      <div class="rounded-2xl bg-surface-container-low p-4">
        <p class="text-[11px] font-black uppercase tracking-widest text-on-surface-variant mb-2">Thông tin người dùng</p>
        <div class="space-y-2 text-sm">
          <p><strong class="text-on-surface">Họ tên:</strong> \${escapeHtml(user.name || 'Chưa có')}</p>
          <p><strong class="text-on-surface">Email:</strong> \${escapeHtml(user.email || 'Chưa có')}</p>
          <p><strong class="text-on-surface">Phòng ban:</strong> \${escapeHtml(user.department || 'Chưa gán')}</p>
          <p><strong class="text-on-surface">Trạng thái:</strong> \${escapeHtml(user.statusLabel || 'Hoạt động')}</p>
        </div>
      </div>
      <div>
        <h4 class="text-[11px] font-black uppercase tracking-widest text-on-surface-variant mb-4">Quyền đang bật</h4>
        <div class="space-y-4">\${permissionItems}</div>
      </div>
      <div class="rounded-2xl bg-surface-container-low p-4">
        <p class="text-[11px] font-black uppercase tracking-widest text-on-surface-variant mb-2">Vai trò hiện tại</p>
        <p class="text-sm text-on-surface leading-relaxed">\${escapeHtml(roleMeta ? roleMeta.name : 'Chưa gán vai trò')}</p>
      </div>
      <div class="pt-2 flex flex-col gap-3">
        <button class="w-full bg-primary text-white py-3 rounded-xl font-bold shadow-md" type="button">
          Người dùng đang đồng bộ từ API
        </button>
        <button class="w-full bg-surface-container-low text-on-surface-variant py-3 rounded-xl font-bold" type="button">
          Chỉnh sửa vai trò sẽ bổ sung sau
        </button>
      </div>
    \`;
  }

  function renderUserTable(items) {
    if (!tableBody) {
      return;
    }

    tableBody.innerHTML = items
      .map(function(user) {
        const roleMeta = getRoleMeta(user);
        const toneClass =
          user.statusTone === 'danger'
            ? 'bg-error'
            : user.statusTone === 'warning'
              ? 'bg-secondary'
              : 'bg-tertiary';

        return \`
          <tr class="hover:bg-surface transition-colors cursor-pointer" data-user-id="\${escapeHtml(user.id || '')}">
            <td class="px-6 py-5">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-700">
                  \${escapeHtml((user.name || 'U').slice(0, 1).toUpperCase())}
                </div>
                <div>
                  <p class="font-semibold text-sm">\${escapeHtml(user.name || 'User')}</p>
                  <p class="text-xs text-on-surface-variant">\${escapeHtml(user.username ? '@' + String(user.username).replace(/^@/, '') : user.email || '')}</p>
                </div>
              </div>
            </td>
            <td class="px-6 py-5">
              <span class="bg-primary-container text-on-primary-container text-xs font-bold px-3 py-1 rounded-full">\${escapeHtml(roleMeta ? roleMeta.name : 'Chưa gán')}</span>
            </td>
            <td class="px-6 py-5">
              <span class="text-sm font-medium text-on-surface-variant">\${escapeHtml(user.department || 'Chưa gán')}</span>
            </td>
            <td class="px-6 py-5">
              <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full \${toneClass}"></div>
                <span class="text-xs font-medium">\${escapeHtml(user.statusLabel || 'Hoạt động')}</span>
              </div>
            </td>
            <td class="px-6 py-5 text-right">
              <button class="text-on-surface-variant hover:text-primary transition-colors" type="button" data-open-user="\${escapeHtml(user.id || '')}">
                <span class="material-symbols-outlined">edit_square</span>
              </button>
            </td>
          </tr>
        \`;
      })
      .join('');
  }

  renderUserTable(users);

  if (tableBody && !tableBody.dataset.liveBound) {
    tableBody.dataset.liveBound = 'true';
    tableBody.addEventListener('click', function(event) {
      const target = event.target.closest('[data-open-user], [data-user-id]');
      if (!target) {
        return;
      }

      const userId = target.getAttribute('data-open-user') || target.getAttribute('data-user-id');
      const selected = users.find(function(user) {
        return user.id === userId;
      });
      if (selected) {
        renderPanel(selected);
      }
    });
  }

  if (createForm && !createForm.dataset.liveBound) {
    createForm.dataset.liveBound = 'true';
    createForm.addEventListener('submit', async function(event) {
      event.preventDefault();
      const formData = new FormData(createForm);
      const payload = {
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        username: String(formData.get('username') || '').trim(),
        department: String(formData.get('department') || '').trim(),
        password: String(formData.get('password') || '').trim(),
        roleId: String(formData.get('roleId') || '').trim(),
        status: String(formData.get('status') || 'ACTIVE').trim(),
      };

      if (!payload.name || !payload.email || !payload.password || !payload.roleId) {
        showInlineStatus(createStatus, 'Vui lòng nhập đủ họ tên, email, mật khẩu và vai trò.', 'warning');
        return;
      }

      const submitButton = createForm.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.classList.add('opacity-70');
      }

      try {
        const created = await fetchJson('/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        users.push(created);
        renderUserTable(users);
        renderPanel(created);
        renderSummary();
        if (totalBadge) {
          totalBadge.textContent = 'Tổng số ' + String(users.length) + ' người dùng';
        }
        createForm.reset();
        if (roleSelect && roleSelect.options.length) {
          roleSelect.selectedIndex = 0;
        }
        showInlineStatus(createStatus, 'Đã tạo người dùng mới và gán vai trò từ API.', 'success');
      } catch (error) {
        if (error && error.status === 403) {
          showInlineStatus(createStatus, 'Tài khoản hiện tại không có quyền tạo người dùng.', 'danger');
        } else {
          showInlineStatus(createStatus, 'Không tạo được người dùng. Kiểm tra dữ liệu hoặc API.', 'danger');
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.classList.remove('opacity-70');
        }
      }
    });
  }

  if (primaryHeaderButton && !primaryHeaderButton.dataset.liveBound) {
    primaryHeaderButton.dataset.liveBound = 'true';
    primaryHeaderButton.addEventListener('click', function() {
      if (createUserCard) {
        createUserCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  function renderSummary() {
    if (!summaryCards) {
      return;
    }

    const cards = Array.from(summaryCards.children);
    const activeUsers = users.filter(function(user) {
      return String(user.status) === 'ACTIVE';
    }).length;
    const lockedUsers = users.filter(function(user) {
      return String(user.status) === 'DISABLED';
    }).length;
    const permissionCount = users.reduce(function(total, user) {
      return total + Number(user.permissionCount || 0);
    }, 0);

    if (cards[0]) {
      setText(cards[0].querySelector('span.block'), 'Tổng người dùng');
      setText(cards[0].querySelector('h4'), String(users.length));
      setText(cards[0].querySelector('p'), 'Đã đồng bộ từ endpoint /users');
    }
    if (cards[1]) {
      setText(cards[1].querySelector('h4'), lockedUsers ? 'Cần rà soát' : 'Ổn định');
      setText(cards[1].querySelector('p'), lockedUsers + ' tài khoản đang ở trạng thái tạm khóa');
    }
    if (cards[2]) {
      setText(cards[2].querySelector('h4'), String(activeUsers));
      setText(cards[2].querySelector('p'), permissionCount + ' quyền đang được gán trên toàn bộ nhân sự');
    }
  }

  renderSummary();

  if (users.length) {
    renderPanel(users[0]);
  }
}
`;
}
