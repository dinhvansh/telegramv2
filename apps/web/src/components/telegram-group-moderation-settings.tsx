"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const apiBaseUrl = "/api";

const authStorageKey = "telegram-ops-access-token";

type GroupModerationSettings = {
  found: boolean;
  groupId: string;
  moderationEnabled: boolean;
  lockUrl: boolean;
  lockInvitelink: boolean;
  lockForward: boolean;
  lockEmail: boolean;
  lockPhone: boolean;
  lockBot: boolean;
  lockPhoto: boolean;
  lockVideo: boolean;
  lockDocument: boolean;
  lockSticker: boolean;
  lockInlineButtons: boolean;
  lockInlineButtonUrls: boolean;
  trustedUsernames: string;
  trustedExternalIds: string;
  exemptAdmins: boolean;
  exemptOwners: boolean;
  lockWarns: boolean;
  warnLimit: number;
  warnAction: "mute" | "tmute" | "kick" | "ban" | "tban";
  warnActionDurationSeconds: number | null;
  warningExpirySeconds: number;
  antifloodEnabled: boolean;
  antifloodLimit: number;
  antifloodWindowSeconds: number;
  antifloodAction: "mute" | "tmute" | "kick" | "ban" | "tban";
  antifloodActionDurationSeconds: number | null;
  antifloodDeleteAll: boolean;
  resetAntifloodOnRejoin: boolean;
  probationEnabled: boolean;
  probationSeconds: number;
  probationAction: "mute" | "tmute" | "kick" | "ban" | "tban";
  probationActionDurationSeconds: number | null;
  antiRaidEnabled: boolean;
  antiRaidAction: "mute" | "tmute" | "kick" | "ban" | "tban";
  antiRaidActionDurationSeconds: number | null;
  aiModerationEnabled: boolean;
  aiMode: "off" | "fallback_only" | "suspicious_only";
  aiConfidenceThreshold: number;
  aiOverrideAction: boolean;
  silentActions: boolean;
  rawLoggingEnabled: boolean;
  detailedLoggingEnabled: boolean;
};

type GroupItem = {
  id: string;
  title: string;
  externalId: string;
  botMemberState?: string | null;
  botRights?: {
    canDeleteMessages: boolean;
    canRestrictMembers: boolean;
    canInviteUsers: boolean;
    canManageTopics: boolean;
  };
};

type ModerationScope = {
  scopeKey: string;
  scopeType: "GLOBAL" | "GROUP";
  scopeLabel: string;
  telegramGroupId: string | null;
  keywords: Array<{ id: string; value: string }>;
  domains: Array<{ id: string; value: string; mode: "BLOCK" | "ALLOW" }>;
};

type ModerationConfigResponse = {
  scopes: ModerationScope[];
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function describeBotRights(group: GroupItem | null) {
  if (!group?.botRights) {
    return "Chưa có dữ liệu quyền bot.";
  }

  const rights = [
    group.botRights.canDeleteMessages ? "Xóa tin nhắn" : null,
    group.botRights.canRestrictMembers ? "Khóa chat" : null,
    group.botRights.canInviteUsers ? "Tạo link mời" : null,
    group.botRights.canManageTopics ? "Quản lý chủ đề" : null,
  ].filter(Boolean);

  return rights.length ? rights.join(" · ") : "Bot chưa có quyền quản trị nào.";
}

function buildDefaultModerationPreset(groupId: string): GroupModerationSettings {
  return {
    found: true,
    groupId,
    moderationEnabled: true,
    lockUrl: true,
    lockInvitelink: true,
    lockForward: false,
    lockEmail: true,
    lockPhone: true,
    lockBot: true,
    lockPhoto: false,
    lockVideo: false,
    lockDocument: false,
    lockSticker: false,
    lockInlineButtons: true,
    lockInlineButtonUrls: true,
    trustedUsernames: "",
    trustedExternalIds: "",
    exemptAdmins: true,
    exemptOwners: true,
    lockWarns: true,
    warnLimit: 2,
    warnAction: "tmute",
    warnActionDurationSeconds: 3600,
    warningExpirySeconds: 86400,
    antifloodEnabled: true,
    antifloodLimit: 6,
    antifloodWindowSeconds: 12,
    antifloodAction: "tmute",
    antifloodActionDurationSeconds: 1800,
    antifloodDeleteAll: true,
    resetAntifloodOnRejoin: true,
    probationEnabled: true,
    probationSeconds: 900,
    probationAction: "tmute",
    probationActionDurationSeconds: 900,
    antiRaidEnabled: true,
    antiRaidAction: "kick",
    antiRaidActionDurationSeconds: null,
    aiModerationEnabled: true,
    aiMode: "suspicious_only",
    aiConfidenceThreshold: 0.82,
    aiOverrideAction: false,
    silentActions: false,
    rawLoggingEnabled: false,
    detailedLoggingEnabled: true,
  };
}

export function TelegramGroupModerationSettings({
  groupId,
}: {
  groupId: string;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupItem | null>(null);
  const [form, setForm] = useState<GroupModerationSettings | null>(null);
  const [scope, setScope] = useState<ModerationScope | null>(null);
  const [keywordInput, setKeywordInput] = useState("");
  const [domainInput, setDomainInput] = useState("");
  const [domainMode, setDomainMode] = useState<"BLOCK" | "ALLOW">("BLOCK");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingRules, setIsUpdatingRules] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = window.localStorage.getItem(authStorageKey);
    setToken(savedToken);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function load(currentToken: string) {
      try {
        const [groupsResponse, settings, moderationConfig] = await Promise.all([
          fetchJson<{ items: GroupItem[] }>(`${apiBaseUrl}/telegram/groups`, {
            headers: { Authorization: `Bearer ${currentToken}` },
          }),
          fetchJson<GroupModerationSettings>(
            `${apiBaseUrl}/telegram/groups/${groupId}/moderation`,
            {
              headers: { Authorization: `Bearer ${currentToken}` },
            },
          ),
          fetchJson<ModerationConfigResponse>(`${apiBaseUrl}/moderation/config`, {
            headers: { Authorization: `Bearer ${currentToken}` },
          }),
        ]);

        if (!isMounted) {
          return;
        }

        setGroup(groupsResponse.items.find((item) => item.id === groupId) ?? null);
        setForm(settings);
        setScope(
          moderationConfig.scopes.find((item) => item.scopeKey === `group:${groupId}`) ?? null,
        );
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Không thể tải cấu hình moderation.",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void load(token);

    return () => {
      isMounted = false;
    };
  }, [groupId, token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !form) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const next = await fetchJson<GroupModerationSettings>(
        `${apiBaseUrl}/telegram/groups/${groupId}/moderation`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify(form),
        },
      );

      setForm(next);
      setNotice("Đã lưu cấu hình moderation.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Không thể lưu cấu hình moderation.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleApplyDefaultPreset() {
    setForm((current) => {
      if (!current) {
        return current;
      }

      const preset = buildDefaultModerationPreset(groupId);
      return {
        ...current,
        ...preset,
        found: current.found,
        groupId: current.groupId,
        trustedUsernames: current.trustedUsernames,
        trustedExternalIds: current.trustedExternalIds,
      };
    });
    setError(null);
    setNotice("Đã áp bộ mặc định moderation cho group này. Bấm lưu để cập nhật hệ thống.");
  }

  async function refreshRuleScope(currentToken: string) {
    const moderationConfig = await fetchJson<ModerationConfigResponse>(
      `${apiBaseUrl}/moderation/config`,
      {
        headers: { Authorization: `Bearer ${currentToken}` },
      },
    );
    setScope(
      moderationConfig.scopes.find((item) => item.scopeKey === `group:${groupId}`) ?? null,
    );
  }

  async function handleAddKeyword() {
    if (!token || !keywordInput.trim()) {
      return;
    }

    setIsUpdatingRules(true);
    setError(null);
    setNotice(null);

    try {
      await fetchJson(`${apiBaseUrl}/moderation/keywords`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          scopeKey: `group:${groupId}`,
          value: keywordInput.trim(),
        }),
      });
      setKeywordInput("");
      await refreshRuleScope(token);
      setNotice("Đã thêm từ khóa vào group này.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Không thể thêm từ khóa.");
    } finally {
      setIsUpdatingRules(false);
    }
  }

  async function handleRemoveKeyword(keywordId: string) {
    if (!token) {
      return;
    }

    setIsUpdatingRules(true);
    setError(null);
    setNotice(null);

    try {
      await fetchJson(`${apiBaseUrl}/moderation/keywords/${keywordId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await refreshRuleScope(token);
      setNotice("Đã xóa từ khóa khỏi group này.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Không thể xóa từ khóa.");
    } finally {
      setIsUpdatingRules(false);
    }
  }

  async function handleAddDomain() {
    if (!token || !domainInput.trim()) {
      return;
    }

    setIsUpdatingRules(true);
    setError(null);
    setNotice(null);

    try {
      await fetchJson(`${apiBaseUrl}/moderation/domains`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          scopeKey: `group:${groupId}`,
          value: domainInput.trim(),
          mode: domainMode,
        }),
      });
      setDomainInput("");
      await refreshRuleScope(token);
      setNotice("Đã cập nhật domain cho group này.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Không thể thêm domain.");
    } finally {
      setIsUpdatingRules(false);
    }
  }

  async function handleRemoveDomain(domainId: string) {
    if (!token) {
      return;
    }

    setIsUpdatingRules(true);
    setError(null);
    setNotice(null);

    try {
      await fetchJson(`${apiBaseUrl}/moderation/domains/${domainId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await refreshRuleScope(token);
      setNotice("Đã xóa domain khỏi group này.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Không thể xóa domain.");
    } finally {
      setIsUpdatingRules(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface)]">
        <div className="rounded-[24px] bg-[color:var(--surface-card)] px-8 py-6 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
          <p className="text-sm font-bold">Đang tải cấu hình moderation...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface)] px-6 text-center">
        <div className="rounded-[24px] bg-[color:var(--surface-card)] px-8 py-6 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
          <p className="text-sm font-bold">Cần đăng nhập trước khi cấu hình group.</p>
          <Link href="/telegram" className="mt-4 inline-flex text-sm font-semibold text-[color:var(--primary)]">
            Quay lại Telegram CRM
          </Link>
        </div>
      </div>
    );
  }

  if (!form?.found) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface)] px-6 text-center">
        <div className="rounded-[24px] bg-[color:var(--surface-card)] px-8 py-6 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
          <p className="text-sm font-bold">Không tìm thấy group.</p>
          <Link href="/telegram" className="mt-4 inline-flex text-sm font-semibold text-[color:var(--primary)]">
            Quay lại Telegram CRM
          </Link>
        </div>
      </div>
    );
  }

  const toggleFieldKeys = [
    ["lockUrl", "Chặn URL"],
    ["lockInvitelink", "Chặn link mời Telegram"],
    ["lockForward", "Chặn tin chuyển tiếp"],
    ["lockEmail", "Chặn email"],
    ["lockPhone", "Chặn số điện thoại"],
    ["lockBot", "Chặn tin gửi qua bot"],
    ["lockPhoto", "Chặn ảnh"],
    ["lockVideo", "Chặn video"],
    ["lockDocument", "Chặn tài liệu"],
    ["lockSticker", "Chặn sticker"],
    ["lockInlineButtons", "Chặn nút inline"],
    ["lockInlineButtonUrls", "Chặn link trong nút inline"],
    ["exemptAdmins", "Miễn trừ admin Telegram"],
    ["exemptOwners", "Miễn trừ owner CRM"],
    ["lockWarns", "Ghi cảnh báo khi vi phạm lock"],
    ["antifloodEnabled", "Bật antiflood"],
    ["antifloodDeleteAll", "Xóa toàn bộ chuỗi spam"],
    ["resetAntifloodOnRejoin", "Reset antiflood khi vào lại"],
    ["probationEnabled", "Theo dõi gắt user mới"],
    ["antiRaidEnabled", "Bật anti-raid"],
    ["aiModerationEnabled", "Bật AI moderation"],
    ["aiOverrideAction", "Cho AI nâng mức xử lý"],
    ["silentActions", "Không announce lên group"],
    ["rawLoggingEnabled", "Lưu raw webhook"],
    ["detailedLoggingEnabled", "Lưu log chi tiết"],
  ] as const;

  const toggleDescriptions: Partial<Record<(typeof toggleFieldKeys)[number][0], string>> = {
    lockUrl: "Chặn tin nhắn có URL web thông thường.",
    lockInvitelink: "Chặn link mời Telegram như t.me/+ hoặc joinchat.",
    lockForward: "Chặn tin chuyển tiếp từ group hoặc channel khác.",
    lockEmail: "Chặn nội dung có địa chỉ email.",
    lockPhone: "Chặn nội dung có số điện thoại.",
    lockBot: "Chặn tin gửi thông qua bot khác hoặc via bot.",
    lockPhoto: "Chặn ảnh gửi vào group.",
    lockVideo: "Chặn video gửi vào group.",
    lockDocument: "Chặn file, tài liệu và đính kèm.",
    lockSticker: "Chặn sticker và nội dung giải trí dạng sticker.",
    lockInlineButtons: "Chặn tin có nút inline bên dưới nội dung.",
    lockInlineButtonUrls: "Chặn riêng trường hợp nút inline có gắn link.",
    exemptAdmins: "Admin Telegram sẽ không bị áp các rule tự động.",
    exemptOwners: "User đang được CRM gắn owner sẽ được bỏ qua automation.",
    lockWarns: "Vi phạm lock sẽ cộng cảnh báo trước khi nâng mức xử lý.",
    antifloodEnabled: "Bắt user gửi quá nhiều tin trong thời gian ngắn.",
    antifloodDeleteAll: "Khi flood, xóa cả chuỗi tin spam thay vì chỉ xử lý 1 tin cuối.",
    resetAntifloodOnRejoin: "User ra rồi vào lại sẽ không bị mang count flood cũ.",
    probationEnabled: "Theo dõi gắt hơn với user mới vào nhóm trong thời gian đầu.",
    antiRaidEnabled: "Chặn làn sóng nhiều nick mới vào nhóm liên tục.",
    aiModerationEnabled: "Dùng AI để hỗ trợ chấm các case mơ hồ hoặc đáng ngờ.",
    aiOverrideAction: "Cho phép AI nâng mức xử lý nếu độ tin cậy đủ cao.",
    silentActions: "Bot vẫn xử lý nhưng không gửi announce ra group.",
    rawLoggingEnabled: "Lưu raw webhook để debug và kiểm tra payload thật.",
    detailedLoggingEnabled: "Lưu thêm log chi tiết cho từng bước moderation.",
  };

  return (
    <div className="min-h-screen bg-[color:var(--surface)] px-5 py-8 text-[color:var(--on-surface)] lg:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Cấu hình moderation của group
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">
                {group?.title ?? "Telegram Group"}
              </h1>
              <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
                Chat ID: {group?.externalId ?? "n/a"}
              </p>
              <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
                Tr?ng th?i bot: {group?.botMemberState ?? "ch?a r?"}
              </p>
              <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
                Quy?n bot: {describeBotRights(group)}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleApplyDefaultPreset}
                className="inline-flex rounded-full bg-[color:var(--primary-soft)] px-4 py-3 text-sm font-semibold text-[color:var(--primary)]"
              >
                Ap bo mac dinh
              </button>
              <Link
                href="/telegram"
                className="inline-flex rounded-full bg-[color:var(--surface-low)] px-4 py-3 text-sm font-semibold"
              >
                Quay lại danh sách group
              </Link>
            </div>
          </div>

          <div className="mt-6 rounded-[24px] bg-[color:var(--surface-low)] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold">Bật kiểm duyệt tự động</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                  Đây là công tắc tổng của group. Khi tắt, bot sẽ không áp các logic chặn spam,
                  cảnh báo, AI hay anti-raid bên dưới.
                </p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--primary)]">
                  Bo mac dinh moi se bat san moderation va bo khoa rule de dung ngay.
                </p>
              </div>
              <label className="inline-flex items-center gap-3 rounded-full bg-white px-4 py-3 text-sm font-semibold">
                <span>{form.moderationEnabled ? "Đang bật" : "Đang tắt"}</span>
                <input
                  type="checkbox"
                  checked={form.moderationEnabled}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            moderationEnabled: event.target.checked,
                          }
                        : current,
                    )
                  }
                />
              </label>
            </div>
          </div>
        </header>

        <form
          onSubmit={handleSubmit}
          className="rounded-[32px] bg-[color:var(--surface-card)] p-5 shadow-[0_8px_32px_rgba(42,52,57,0.08)] sm:p-7"
        >
          <div className="grid gap-6 2xl:grid-cols-[1.05fr_0.95fr]">
            <section>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Ma trận khóa nội dung
              </p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                Bật hoặc tắt từng kiểu nội dung cần chặn. Mỗi mục bên dưới là một logic độc lập,
                có thể dùng riêng hoặc kết hợp với cảnh báo, antiflood và AI.
              </p>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {toggleFieldKeys.map(([key, label]) => (
                  <label
                    key={key}
                    className="flex flex-col gap-3 rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-semibold">{label}</span>
                      {toggleDescriptions[key] ? (
                        <p className="mt-1 text-xs leading-5 text-[color:var(--on-surface-variant)]">
                          {toggleDescriptions[key]}
                        </p>
                      ) : null}
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(form[key])}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                [key]: event.target.checked,
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-5">
              <div className="rounded-[24px] bg-[color:var(--surface-low)] p-5">
                <p className="text-sm font-bold">Miễn trừ / Danh sách tin cậy</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                  Những user nằm trong danh sách này sẽ không bị bot tự động warn, mute, kick
                  hoặc ban. Dùng cho owner, admin vận hành hoặc tài khoản nội bộ.
                </p>
                <div className="mt-4 grid gap-4">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Username được tin cậy
                    </span>
                    <input
                      type="text"
                      value={form.trustedUsernames}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                trustedUsernames: event.target.value,
                              }
                            : current,
                        )
                      }
                      placeholder="@owner_a, trusted_mod"
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      External ID được tin cậy
                    </span>
                    <input
                      type="text"
                      value={form.trustedExternalIds}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                trustedExternalIds: event.target.value,
                              }
                            : current,
                        )
                      }
                      placeholder="123456789, 99887766"
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-[24px] bg-[color:var(--surface-low)] p-5">
                <p className="text-sm font-bold">Quy tắc cảnh báo</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                  Dùng để cộng dồn vi phạm nhẹ. Khi user chạm ngưỡng cảnh báo, bot sẽ tự nâng lên
                  hành động ở bên dưới như khóa chat, kick hoặc ban.
                </p>
                <div className="mt-4 grid gap-4">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Ngưỡng cảnh báo
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={form.warnLimit}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                warnLimit: Number(event.target.value || 1),
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                    <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">
                      Ví dụ để 2 nghĩa là user vi phạm 2 lần sẽ bị nâng sang hành động bên dưới.
                    </p>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Hành động khi chạm ngưỡng
                    </span>
                    <select
                      value={form.warnAction}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                warnAction: event.target.value as GroupModerationSettings["warnAction"],
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    >
                      <option value="mute">Khóa chat</option>
                      <option value="tmute">Khóa chat tạm thời</option>
                      <option value="kick">Kick khỏi nhóm</option>
                      <option value="ban">Cấm vĩnh viễn</option>
                      <option value="tban">Cấm tạm thời</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Thời lượng hành động cảnh báo (giây)
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={form.warnActionDurationSeconds ?? ""}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                warnActionDurationSeconds: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Thời gian hết hạn cảnh báo (giây)
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={form.warningExpirySeconds}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                warningExpirySeconds: Number(event.target.value || 0),
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-[24px] bg-[color:var(--surface-low)] p-5">
                <p className="text-sm font-bold">Chống spam liên tục</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                  Dùng khi một user gửi quá nhiều tin nhắn trong một khoảng thời gian ngắn.
                </p>
                <div className="mt-4 grid gap-4">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Số tin nhắn tối đa
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={form.antifloodLimit}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                antifloodLimit: Number(event.target.value || 1),
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Khoảng thời gian (giây)
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={form.antifloodWindowSeconds}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                antifloodWindowSeconds: Number(event.target.value || 1),
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Hành động khi flood
                    </span>
                    <select
                      value={form.antifloodAction}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                antifloodAction:
                                  event.target.value as GroupModerationSettings["antifloodAction"],
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    >
                      <option value="mute">Khóa chat</option>
                      <option value="tmute">Khóa chat tạm thời</option>
                      <option value="kick">Kick khỏi nhóm</option>
                      <option value="ban">Cấm vĩnh viễn</option>
                      <option value="tban">Cấm tạm thời</option>
                    </select>
                    <p className="mt-2 text-xs text-[color:var(--on-surface-variant)]">
                      Đây là hình phạt khi user vượt số tin tối đa trong khoảng thời gian đã đặt.
                    </p>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Thời lượng flood action (giây)
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={form.antifloodActionDurationSeconds ?? ""}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                antifloodActionDurationSeconds: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-[24px] bg-[color:var(--surface-low)] p-5">
                <p className="text-sm font-bold">User mới / chống vào nhóm tự động</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--on-surface-variant)]">
                  Probation dùng để siết user mới trong thời gian đầu. Anti-raid dùng để chặn làn sóng nhiều nick mới vào nhóm liên tục.
                </p>
                <div className="mt-4 grid gap-4">
                  <label className="flex items-center justify-between gap-4 rounded-[16px] bg-white px-4 py-3 text-sm font-semibold">
                    <span>Bật probation</span>
                    <input
                      type="checkbox"
                      checked={form.probationEnabled}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                probationEnabled: event.target.checked,
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Thời gian probation (giây)
                    </span>
                    <input
                      type="number"
                      min={60}
                      disabled={!form.probationEnabled}
                      value={form.probationSeconds}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                probationSeconds: Number(event.target.value || 60),
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none disabled:opacity-50"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Hành động trong probation
                    </span>
                    <select
                      disabled={!form.probationEnabled}
                      value={form.probationAction}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                probationAction:
                                  event.target.value as GroupModerationSettings["probationAction"],
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none disabled:opacity-50"
                    >
                      <option value="mute">Khóa chat</option>
                      <option value="tmute">Khóa chat tạm thời</option>
                      <option value="kick">Kick khỏi nhóm</option>
                      <option value="ban">Cấm vĩnh viễn</option>
                      <option value="tban">Cấm tạm thời</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Thời lượng probation action (giây)
                    </span>
                    <input
                      type="number"
                      min={0}
                      disabled={!form.probationEnabled}
                      value={form.probationActionDurationSeconds ?? ""}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                probationActionDurationSeconds: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none disabled:opacity-50"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-4 rounded-[16px] bg-white px-4 py-3 text-sm font-semibold">
                    <span>Bật anti-raid</span>
                    <input
                      type="checkbox"
                      checked={form.antiRaidEnabled}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                antiRaidEnabled: event.target.checked,
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Hành động anti-raid
                    </span>
                    <select
                      disabled={!form.antiRaidEnabled}
                      value={form.antiRaidAction}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                antiRaidAction:
                                  event.target.value as GroupModerationSettings["antiRaidAction"],
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none disabled:opacity-50"
                    >
                      <option value="mute">Khóa chat</option>
                      <option value="tmute">Khóa chat tạm thời</option>
                      <option value="kick">Kick khỏi nhóm</option>
                      <option value="ban">Cấm vĩnh viễn</option>
                      <option value="tban">Cấm tạm thời</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Thời lượng anti-raid (giây)
                    </span>
                    <input
                      type="number"
                      min={0}
                      disabled={!form.antiRaidEnabled}
                      value={form.antiRaidActionDurationSeconds ?? ""}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                antiRaidActionDurationSeconds: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none disabled:opacity-50"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-[24px] bg-[color:var(--surface-low)] p-5">
                <p className="text-sm font-bold">AI moderation</p>
                <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
                  Chỉ nên bật khi đã cấu hình AI provider thật trong phần settings hoặc env production.
                </p>
                <div className="mt-4 grid gap-4">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Chế độ AI
                    </span>
                    <select
                      value={form.aiMode}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                aiMode: event.target.value as GroupModerationSettings["aiMode"],
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    >
                      <option value="off">off</option>
                      <option value="fallback_only">Chỉ khi rule chưa đủ chắc</option>
                      <option value="suspicious_only">Chỉ khi nội dung đáng ngờ</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Ngưỡng tin cậy
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step="0.01"
                      value={form.aiConfidenceThreshold}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                aiConfidenceThreshold: Number(event.target.value || 0),
                              }
                            : current,
                        )
                      }
                      className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-[24px] bg-[color:var(--surface-low)] p-5">
                <p className="text-sm font-bold">Keyword / Domain theo group</p>
                <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
                  Đây là nơi cấu hình rule riêng cho group này. Khối policy cũ ở màn Chống spam
                  sẽ chỉ còn vai trò theo dõi.
                </p>

                <div className="mt-4 space-y-5">
                  <div className="rounded-[20px] bg-white/55 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Từ khóa bổ sung
                    </p>
                    <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
                      Dùng cho các cụm từ spam đặc thù như tên thương hiệu giả, keyword lừa đảo hoặc
                      câu mời chào mà group này thường gặp.
                    </p>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                      <input
                        value={keywordInput}
                        onChange={(event) => setKeywordInput(event.target.value)}
                        className="min-w-0 flex-1 rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                        placeholder="Ví dụ: fake support"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddKeyword()}
                        disabled={isUpdatingRules}
                        className="rounded-[16px] bg-[color:var(--primary)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        Thêm
                      </button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {scope?.keywords.length ? (
                        scope.keywords.map((keyword) => (
                          <button
                            key={keyword.id}
                            type="button"
                            onClick={() => void handleRemoveKeyword(keyword.id)}
                            className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-[color:var(--on-surface)]"
                          >
                            {keyword.value} ×
                          </button>
                        ))
                      ) : (
                        <span className="text-sm text-[color:var(--on-surface-variant)]">
                          Chưa có từ khóa riêng cho group này.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[20px] bg-white/55 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                      Domain allow / block
                    </p>
                    <p className="mt-2 text-sm text-[color:var(--on-surface-variant)]">
                      `Block` để chặn domain spam. `Allow` để đưa domain hợp lệ vào danh sách cho
                      phép của riêng group này.
                    </p>
                    <label className="mt-3 block">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--on-surface-variant)]">
                        Domain cần thêm
                      </span>
                      <input
                        value={domainInput}
                        onChange={(event) => setDomainInput(event.target.value)}
                        className="w-full rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                        placeholder="Ví dụ: tinyurl.com"
                      />
                    </label>
                    <div className="mt-3 flex flex-col gap-3">
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                        <select
                          value={domainMode}
                          onChange={(event) =>
                            setDomainMode(event.target.value as "BLOCK" | "ALLOW")
                          }
                          className="rounded-[16px] bg-white px-4 py-3 text-sm outline-none"
                        >
                          <option value="BLOCK">Block</option>
                          <option value="ALLOW">Allow</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => void handleAddDomain()}
                          disabled={isUpdatingRules}
                          className="rounded-[16px] bg-[color:var(--primary)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          Thêm
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {scope?.domains.length ? (
                        scope.domains.map((domain) => (
                          <button
                            key={domain.id}
                            type="button"
                            onClick={() => void handleRemoveDomain(domain.id)}
                            className={`rounded-full px-3 py-2 text-xs font-semibold ${
                              domain.mode === "ALLOW"
                                ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                                : "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                            }`}
                          >
                            {domain.mode}: {domain.value} ×
                          </button>
                        ))
                      ) : (
                        <span className="text-sm text-[color:var(--on-surface-variant)]">
                          Chưa có domain riêng cho group này.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {error ? (
            <div className="mt-6 rounded-[18px] bg-[color:var(--danger-soft)] px-4 py-3 text-sm text-[color:var(--danger)]">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="mt-6 rounded-[18px] bg-[color:var(--success-soft)] px-4 py-3 text-sm text-[color:var(--success)]">
              {notice}
            </div>
          ) : null}

          <div className="mt-6 flex justify-stretch sm:justify-end">
            <button
              disabled={isSaving}
              className="w-full rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
            >
              {isSaving ? "Đang lưu..." : "Lưu cấu hình moderation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
