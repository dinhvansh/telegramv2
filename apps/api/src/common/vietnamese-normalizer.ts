const exactTextMap = new Map<string, string>([
  ['SuperAdmin', 'Quản trị hệ thống'],
  ['Admin', 'Quản trị workspace'],
  ['Moderator', 'Kiểm duyệt viên'],
  ['Operator', 'Vận hành'],
  ['Viewer', 'Cộng tác viên'],
  ['System Super Admin', 'Quản trị hệ thống'],
  ['Nexus Admin', 'Quản trị workspace'],
  ['Campaign Operator', 'Vận hành'],
  ['Trust Moderator', 'Kiểm duyệt viên'],
  ['Qu?n tr? workspace', 'Quản trị workspace'],
  ['Qu?n tr? h? th?ng', 'Quản trị hệ thống'],
  ['Ki?m duy?t vi?n', 'Kiểm duyệt viên'],
  ['V?n h?nh', 'Vận hành'],
  ['C?ng t?c vi?n', 'Cộng tác viên'],
  [
    'To�n quy?n v?n h�nh trong workspace, g?m user, role, settings, campaign, moderation v� autopost.',
    'Toàn quyền vận hành trong workspace, gồm user, role, settings, campaign, moderation và autopost.',
  ],
  [
    'To�n quy?n v?n h�nh trong workspace, tr? qu?n l� user v� ph�n quy?n.',
    'Toàn quyền vận hành trong workspace, trừ quản lý user và phân quyền.',
  ],
  [
    'Ch? xem campaign ???c giao v? k?t qu? link m?i c? nh?n.',
    'Chỉ xem campaign được giao và kết quả link mời cá nhân.',
  ],
  ['ChÆ°a gÃ¡n', 'Chưa gán'],
  ['Váº¯ng máº·t', 'Vắng mặt'],
  ['Táº¡m khÃ³a', 'Tạm khóa'],
  ['Hoáº¡t Ä‘á»™ng', 'Hoạt động'],
  ['Ná»n táº£ng', 'Nền tảng'],
  ['Háº¡ táº§ng', 'Hạ tầng'],
  ['TÄƒng trÆ°á»Ÿng', 'Tăng trưởng'],
  ['Quan sÃ¡t', 'Quan sát'],
  ['Cá»™ng Ä‘á»“ng', 'Cộng đồng'],
  ['Quáº£n trá»‹ há»‡ thá»‘ng', 'Quản trị hệ thống'],
  ['Quáº£n trá»‹ workspace', 'Quản trị workspace'],
  ['Kiá»ƒm duyá»‡t viÃªn', 'Kiểm duyệt viên'],
  ['Váº­n hÃ nh', 'Vận hành'],
  ['Cá»™ng tÃ¡c viÃªn', 'Cộng tác viên'],
]);

const fragmentMap: Array<[string, string]> = [
  ['Qu?n tr?', 'Quản trị'],
  ['h? th?ng', 'hệ thống'],
  ['Ki?m duy?t vi?n', 'Kiểm duyệt viên'],
  ['V?n h?nh', 'Vận hành'],
  ['C?ng t?c vi?n', 'Cộng tác viên'],
  ['To�n quy?n', 'Toàn quyền'],
  ['v?n h�nh', 'vận hành'],
  ['g?m', 'gồm'],
  ['v�', 'và'],
  ['tr?', 'trừ'],
  ['qu?n l�', 'quản lý'],
  ['ph�n quy?n', 'phân quyền'],
  ['Ch?', 'Chỉ'],
  ['???c', 'được'],
  ['v?', 'và'],
  ['k?t qu?', 'kết quả'],
  ['m?i', 'mời'],
  ['c? nh?n', 'cá nhân'],
];

export function normalizeVietnameseText(value?: string | null) {
  if (!value) {
    return value ?? '';
  }

  const exactMatch = exactTextMap.get(value);
  if (exactMatch) {
    return exactMatch;
  }

  let normalized = value;
  for (const [broken, fixed] of fragmentMap) {
    normalized = normalized.split(broken).join(fixed);
  }
  return normalized;
}
