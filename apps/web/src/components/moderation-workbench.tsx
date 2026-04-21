"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/context/toast-context";

const apiBaseUrl = "/api";
const authStorageKey = "telegram-ops-access-token";

type SpamDecision = "ALLOW" | "REVIEW" | "WARN" | "RESTRICT" | "BAN";

type ModerationEvent = {
  id: string;
  source: string;
  eventType: string;
  actorUsername: string | null;
  actorExternalId: string | null;
  groupTitle: string;
  groupExternalId: string | null;
  campaignLabel: string | null;
  messageText: string | null;
  messageExternalId: string | null;
  matchedRules: string[];
  ruleScore: number;
  aiScore: number | null;
  finalScore: number;
  aiLabel: string | null;
  aiReason: string | null;
  decision: SpamDecision;
  decisionLabel: string;
  manualDecision: SpamDecision | null;
  manualDecisionLabel: string | null;
  manualNote: string | null;
  reviewedAt: string | null;
  actionLogs: unknown[];
  lastActionAt: string | null;
  createdAt: string;
};

type ModerationScope = {
  scopeKey: string;
  scopeType: "GLOBAL" | "GROUP";
  scopeLabel: string;
  telegramGroupId: string | null;
  inheritsFromGlobal: boolean;
  autoBanSpam: boolean;
  muteNewMembers: boolean;
  muteDurationHours: number;
  keywords: Array<{ id: string; value: string }>;
  domains: Array<{ id: string; value: string; mode: "BLOCK" | "ALLOW" }>;
};

type ModerationConfig = {
  builtInRules: {
    keywords: string[];
    riskyDomains: string[];
    usernameRule: string;
    socialEngineeringRule: string;
    linkRules: {
      singleLinkScore: number;
      multipleLinksScore: number;
    };
    decisionThresholds: {
      ban: number;
      restrict: number;
      warn: number;
      review: number;
    };
  };
  scopes: ModerationScope[];
};

type AnalyzeResponse = {
  decisionLabel: string;
  decision?: SpamDecision;
  finalScore: number;
  matchedRules: string[];
  aiProvider: string;
  policyLabel: string;
  reviewRequired: boolean;
  warningContext?: {
    currentWarningCount: number;
    nextWarningCount: number;
    warnLimit: number;
    warnAction: string;
    triggered: boolean;
  };
};

type ModerationJob = {
  id: string;
  source: string;
  status: string;
  eventType: string;
  actionVariant: string;
  chatId: string;
  userId: string;
  groupTitle: string | null;
  note: string | null;
  commandText: string | null;
  expireAt: string | null;
  completedAt: string | null;
  lastError: string | null;
};

type SystemLogItem = {
  id: string;
  level: "INFO" | "WARN" | "ERROR";
  scope: string;
  action: string;
  message: string;
  detail: string | null;
  payload?: unknown;
  createdAt: string;
};

type DebugOverview = {
  jobs: ModerationJob[];
  logs: SystemLogItem[];
};

type CommandExecutionResponse = {
  executed?: boolean;
  skipped?: boolean;
  reason?: string;
  command?: {
    rawText?: string;
    command?: string;
  };
  action?: {
    enforced?: boolean;
    actionVariant?: string;
    scheduledJobs?: Array<{ id: string; expiresAt: string; actionVariant: string }>;
  };
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
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function getDecisionTone(decision: SpamDecision | null) {
  switch (decision) {
    case "BAN":
      return "bg-[color:var(--danger-soft)] text-[color:var(--danger)]";
    case "RESTRICT":
      return "bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
    case "WARN":
      return "bg-[color:var(--primary-soft)] text-[color:var(--primary)]";
    case "REVIEW":
      return "bg-[color:var(--surface-low)] text-[color:var(--on-surface)]";
    case "ALLOW":
      return "bg-[color:var(--success-soft)] text-[color:var(--success)]";
    default:
      return "bg-[color:var(--surface-low)] text-[color:var(--on-surface-variant)]";
  }
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Chưa có";
  }

  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function extractWarningSummary(matchedRules: string[]) {
  const ladderRule = matchedRules.find((rule) => rule.startsWith("warning_ladder:"));
  const countRule = matchedRules.find((rule) => rule.startsWith("warning_count:"));
  const actionRule = matchedRules.find((rule) => rule.startsWith("warning_action:"));

  if (!ladderRule && !countRule) {
    return null;
  }

  const progress = (ladderRule ?? countRule ?? "").split(":")[1] ?? "";
  const [nextRaw, limitRaw] = progress.split("/");

  return {
    nextWarningCount: Number(nextRaw || 0),
    warnLimit: Number(limitRaw || 0),
    triggered: Boolean(ladderRule),
    actionLabel: actionRule ? actionRule.split(":")[1] ?? "warn" : "warn",
  };
}

function formatTelegramMethod(method: string) {
  switch (method) {
    case "deleteMessage":
      return "Xóa tin nhắn";
    case "restrictChatMember":
      return "Khóa gửi tin";
    case "banChatMember":
      return "Cấm thành viên";
    case "approveChatJoinRequest":
      return "Duyệt yêu cầu vào nhóm";
    case "declineChatJoinRequest":
      return "Từ chối yêu cầu vào nhóm";
    default:
      return method;
  }
}

function formatJsonPayload(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ModerationWorkbench({
  workspaceId = null,
  telegramBotId = null,
}: {
  workspaceId?: string | null;
  telegramBotId?: string | null;
}) {
  void telegramBotId;
  const [token, setToken] = useState<string | null>(null);
  const [events, setEvents] = useState<ModerationEvent[]>([]);
  const [config, setConfig] = useState<ModerationConfig | null>(null);
  const [debugOverview, setDebugOverview] = useState<DebugOverview | null>(null);
  const [selectedRawLogId, setSelectedRawLogId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedScopeKey, setSelectedScopeKey] = useState("global");
  const [manualDecision, setManualDecision] = useState<SpamDecision>("REVIEW");
  const [manualNote, setManualNote] = useState("");
  const [simulateForm, setSimulateForm] = useState({
    groupTitle: "Nexus Global",
    campaignLabel: "Summer Growth 2026",
    actorUsername: "bonus_airdrop",
    eventType: "message_received",
    messageText: "Claim free USDT now at https://bit.ly/fake-airdrop",
  });
  const [commandForm, setCommandForm] = useState({
    groupTitle: "Nexus Global",
    actorUsername: "crm_admin",
    targetUsername: "bonus_airdrop",
    targetExternalId: "bonus_airdrop",
    targetMessageId: "",
    commandText: "/tmute 2h spam link",
    note: "Chạy thử từ CRM local",
  });
  const [simulateResult, setSimulateResult] = useState<AnalyzeResponse | null>(null);
  const [commandResult, setCommandResult] = useState<CommandExecutionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplyingAction, setIsApplyingAction] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isRunningCommand, setIsRunningCommand] = useState(false);
  const [isProcessingJobs, setIsProcessingJobs] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setToken(window.localStorage.getItem(authStorageKey));
  }, []);

  const buildHeaders = useCallback(
    (currentToken: string) => ({
      Authorization: `Bearer ${currentToken}`,
      ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
    }),
    [workspaceId],
  );

  const loadAll = useCallback(async (currentToken: string) => {
    const headers = buildHeaders(currentToken);
    const [eventsResponse, configResponse, debugResponse] = await Promise.all([
      fetchJson<ModerationEvent[]>(`${apiBaseUrl}/moderation/events`, { headers }),
      fetchJson<ModerationConfig>(`${apiBaseUrl}/moderation/config`, { headers }),
      fetchJson<DebugOverview>(`${apiBaseUrl}/moderation/debug`, { headers }),
    ]);

    setEvents(eventsResponse);
    setConfig(configResponse);
    setDebugOverview(debugResponse);

    const defaultScope =
      configResponse.scopes.find((scope) => scope.scopeKey === selectedScopeKey) ??
      configResponse.scopes[0];
    if (defaultScope) {
      setSelectedScopeKey(defaultScope.scopeKey);
      setSimulateForm((current) => ({
        ...current,
        groupTitle:
          defaultScope.scopeType === "GROUP" ? defaultScope.scopeLabel : current.groupTitle,
      }));
    }

    const firstEvent = eventsResponse[0] ?? null;
    setSelectedEventId(firstEvent?.id ?? null);
    setManualDecision(
      (firstEvent?.manualDecision ?? firstEvent?.decision ?? "REVIEW") as SpamDecision,
    );
    setManualNote(firstEvent?.manualNote ?? "");
  }, [buildHeaders, selectedScopeKey]);

  useEffect(() => {
    let active = true;

    async function run() {
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        await loadAll(token);
      } catch (loadError) {
        toast({ message: loadError instanceof Error ? loadError.message : "Không thể tải dữ liệu moderation.", type: "error" });
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [loadAll, toast, token]);

  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;
  const selectedWarningSummary = selectedEvent
    ? extractWarningSummary(selectedEvent.matchedRules)
    : null;
  const selectedScope =
    config?.scopes.find((scope) => scope.scopeKey === selectedScopeKey) ??
    config?.scopes[0] ??
    null;
  const rawWebhookLogs = (debugOverview?.logs || []).filter(
    (log) => log.scope === "telegram.webhook" && log.payload,
  );
  const selectedRawLog =
    rawWebhookLogs.find((log) => log.id === selectedRawLogId) ?? rawWebhookLogs[0] ?? null;

  useEffect(() => {
    if (!selectedScope) {
      return;
    }

    if (selectedScope.scopeType === "GROUP") {
      setSimulateForm((current) => ({
        ...current,
        groupTitle: selectedScope.scopeLabel,
      }));
      setCommandForm((current) => ({
        ...current,
        groupTitle: selectedScope.scopeLabel,
      }));
    }
  }, [selectedScope]);

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }

    setManualDecision((selectedEvent.manualDecision ?? selectedEvent.decision) as SpamDecision);
    setManualNote(selectedEvent.manualNote ?? "");
  }, [selectedEvent]);

  async function refreshData() {
    if (!token) {
      return;
    }

    await loadAll(token);
  }


  async function handleApplyAction() {
    if (!token || !selectedEvent) {
      return;
    }

    setIsApplyingAction(true);

    try {
      await fetchJson(`${apiBaseUrl}/moderation/events/${selectedEvent.id}/action`, {
        method: "POST",
        headers: buildHeaders(token),
        body: JSON.stringify({
          decision: manualDecision,
          note: manualNote,
        }),
      });
      await refreshData();
      toast({ message: "Đã áp dụng quyết định thủ công.", type: "success" });
    } catch (applyError) {
      toast({ message: applyError instanceof Error ? applyError.message : "Không thể áp dụng quyết định.", type: "error" });
    } finally {
      setIsApplyingAction(false);
    }
  }

  async function handleSimulate() {
    if (!token) {
      return;
    }

    setIsSimulating(true);

    try {
      const result = await fetchJson<AnalyzeResponse>(`${apiBaseUrl}/moderation/analyze`, {
        method: "POST",
        headers: buildHeaders(token),
        body: JSON.stringify({
          source: "manual",
          eventType: simulateForm.eventType,
          groupTitle: simulateForm.groupTitle,
          campaignLabel: simulateForm.campaignLabel,
          actorUsername: simulateForm.actorUsername,
          messageText: simulateForm.messageText,
        }),
      });
      setSimulateResult(result);
      await refreshData();
      toast({ message: "Đã phân tích thử và ghi event vào queue.", type: "success" });
    } catch (simulateError) {
      toast({ message: simulateError instanceof Error ? simulateError.message : "Không thể chạy phân tích thử.", type: "error" });
    } finally {
      setIsSimulating(false);
    }
  }

  async function handleExecuteCommand() {
    if (!token) {
      return;
    }

    setIsRunningCommand(true);

    try {
      const result = await fetchJson<CommandExecutionResponse>(
        `${apiBaseUrl}/telegram/commands/execute`,
        {
          method: "POST",
          headers: buildHeaders(token),
          body: JSON.stringify(commandForm),
        },
      );
      setCommandResult(result);
      await refreshData();
      toast({ message: "Đã chạy command quản trị từ CRM.", type: "success" });
    } catch (commandError) {
      toast({ message: commandError instanceof Error ? commandError.message : "Không thể chạy command quản trị.", type: "error" });
    } finally {
      setIsRunningCommand(false);
    }
  }

  async function handleProcessDueJobs() {
    if (!token) {
      return;
    }

    setIsProcessingJobs(true);

    try {
      await fetchJson(`${apiBaseUrl}/moderation/jobs/process-due`, {
        method: "POST",
        headers: buildHeaders(token),
      });
      await refreshData();
      toast({ message: "Đã chạy xử lý các action đến hạn.", type: "success" });
    } catch (jobError) {
      toast({ message: jobError instanceof Error ? jobError.message : "Không thể xử lý action đến hạn.", type: "error" });
    } finally {
      setIsProcessingJobs(false);
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-sm font-semibold text-[color:var(--on-surface-variant)]">
          Đang tải dữ liệu chống spam...
        </p>
      </section>
    );
  }

  if (!token) {
    return (
      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <p className="text-sm font-semibold text-[color:var(--warning)]">
          Cần đăng nhập để dùng moderation workbench.
        </p>
      </section>
    );
  }

  const summary = events.reduce(
    (accumulator, event) => ({
      total: accumulator.total + 1,
      review:
        accumulator.review +
        ((event.manualDecision ?? event.decision) === "REVIEW" ? 1 : 0),
      ban:
        accumulator.ban +
        ((event.manualDecision ?? event.decision) === "BAN" ? 1 : 0),
      restrict:
        accumulator.restrict +
        ((event.manualDecision ?? event.decision) === "RESTRICT" ? 1 : 0),
    }),
    { total: 0, review: 0, ban: 0, restrict: 0 },
  );

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Tổng sự kiện", summary.total],
          ["Chờ review", summary.review],
          ["Ban", summary.ban],
          ["Restrict", summary.restrict],
        ].map(([label, value]) => (
          <article
            key={label}
            className="rounded-[24px] bg-[color:var(--surface-card)] px-5 py-5 shadow-[0_8px_32px_rgba(42,52,57,0.04)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--on-surface-variant)]">
              {label}
            </p>
            <p className="mt-3 text-3xl font-black tracking-tight">{value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Queue chống spam
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-tight">
                Xem sự kiện, đọc rule trúng và xử lý thủ công ngay trên CRM
              </h3>
            </div>
            <button
              onClick={() => void refreshData()}
              className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold"
            >
              Tải lại
            </button>
          </div>

          <div className="mt-6 overflow-hidden rounded-[24px] bg-[color:var(--surface-low)]">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-xs uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  <th className="px-5 py-4 font-semibold">User</th>
                  <th className="px-5 py-4 font-semibold">Group</th>
                  <th className="px-5 py-4 font-semibold">Điểm</th>
                  <th className="px-5 py-4 font-semibold">Quyết định</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, index) => {
                  const effectiveDecision = event.manualDecision ?? event.decision;

                  return (
                    <tr
                      key={event.id}
                      onClick={() => setSelectedEventId(event.id)}
                      className={`cursor-pointer ${index % 2 === 1 ? "bg-white/70" : ""} ${
                        selectedEvent?.id === event.id ? "bg-[color:var(--primary-soft)]/60" : ""
                      }`}
                    >
                      <td className="px-5 py-4 align-top">
                        <p className="text-sm font-bold">
                          @{event.actorUsername ?? event.actorExternalId ?? "ẩn danh"}
                        </p>
                        <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                          {event.campaignLabel ?? "Không gắn campaign"}
                        </p>
                      </td>
                      <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                        <p>{event.groupTitle}</p>
                        <p className="mt-1">{formatDateTime(event.createdAt)}</p>
                      </td>
                      <td className="px-5 py-4 align-top text-sm font-semibold">
                        <p>Rule {event.ruleScore}</p>
                        <p className="mt-1 text-[color:var(--on-surface-variant)]">
                          Tổng {event.finalScore}
                        </p>
                      </td>
                      <td className="px-5 py-4 align-top text-sm">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getDecisionTone(
                            effectiveDecision,
                          )}`}
                        >
                          {event.manualDecisionLabel ?? event.decisionLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
            Chi tiết sự kiện
          </p>
          {selectedEvent ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black">
                      @{selectedEvent.actorUsername ?? selectedEvent.actorExternalId ?? "ẩn danh"}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                      {selectedEvent.groupTitle} · {selectedEvent.campaignLabel ?? "Không gắn campaign"}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getDecisionTone(
                      selectedEvent.manualDecision ?? selectedEvent.decision,
                    )}`}
                  >
                    {selectedEvent.manualDecisionLabel ?? selectedEvent.decisionLabel}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 text-sm text-[color:var(--on-surface-variant)]">
                  <p>Loại sự kiện: {selectedEvent.eventType}</p>
                  <p>AI score: {selectedEvent.aiScore ?? "Bỏ qua"}</p>
                  <p>Thời gian: {formatDateTime(selectedEvent.createdAt)}</p>
                  <p>Đã review: {formatDateTime(selectedEvent.reviewedAt)}</p>
                </div>

                {selectedWarningSummary ? (
                  <div className="mt-4 rounded-[18px] bg-white/70 px-4 py-4 text-sm">
                    <p className="font-bold text-[color:var(--on-surface)]">
                      Thang cảnh báo
                    </p>
                    <div className="mt-2 grid gap-2 text-[color:var(--on-surface-variant)] md:grid-cols-2">
                      <p>
                        Mốc hiện tại: {selectedWarningSummary.nextWarningCount}/
                        {selectedWarningSummary.warnLimit}
                      </p>
                      <p>
                        Trạng thái:{" "}
                        {selectedWarningSummary.triggered
                          ? "Đã chạm ngưỡng escalation"
                          : "Chưa chạm ngưỡng"}
                      </p>
                      <p>
                        Hành động ladder: {selectedWarningSummary.actionLabel}
                      </p>
                      <p>
                        Event này:{" "}
                        {selectedWarningSummary.triggered
                          ? "Bị nâng mức xử lý"
                          : "Chỉ ghi nhận cảnh báo"}
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 rounded-[18px] bg-white/70 px-4 py-4 text-sm leading-6">
                  {selectedEvent.messageText ?? "Sự kiện này không có nội dung text."}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedEvent.matchedRules.map((rule) => (
                    <span
                      key={rule}
                      className="rounded-full bg-white/75 px-3 py-1 text-xs font-semibold text-[color:var(--on-surface-variant)]"
                    >
                      {rule}
                    </span>
                  ))}
                </div>

                {selectedEvent.actionLogs.length ? (
                  <div className="mt-4 rounded-[18px] bg-white/70 px-4 py-4">
                    <p className="text-sm font-bold">Lịch sử thực thi</p>
                    <div className="mt-3 space-y-3">
                      {selectedEvent.actionLogs.map((entry, index) => {
                        const log = entry as {
                          executedAt?: string;
                          source?: string;
                          decision?: string;
                          note?: string | null;
                          result?: {
                            enforced?: boolean;
                            skipped?: boolean;
                            reason?: string;
                            userGuidance?: string | null;
                            missingPermissions?: Array<{
                              code: string;
                              label: string;
                              adminPermission: string;
                            }>;
                            operations?: Array<{
                              method: string;
                              ok: boolean;
                              description: string | null;
                              userGuidance?: string | null;
                              missingPermission?: {
                                code: string;
                                label: string;
                                adminPermission: string;
                              } | null;
                            }>;
                          };
                        };

                        return (
                          <div
                            key={`${log.executedAt ?? "log"}-${index}`}
                            className="rounded-[16px] bg-[color:var(--surface-low)] px-3 py-3 text-sm"
                          >
                            <p className="font-semibold">
                              {log.decision ?? "Không rõ quyết định"} ·{" "}
                              {formatDateTime(log.executedAt ?? null)}
                            </p>
                            <p className="mt-1 text-[color:var(--on-surface-variant)]">
                              Nguồn: {log.source ?? "không rõ"} ·{" "}
                              {log.result?.enforced
                                ? "Đã gọi Telegram API"
                                : log.result?.skipped
                                  ? "Bỏ qua thực thi"
                                  : "Chưa thực thi"}
                            </p>
                            {log.note ? (
                              <p className="mt-1 text-[color:var(--on-surface-variant)]">
                                Ghi chú: {log.note}
                              </p>
                            ) : null}
                            {log.result?.reason ? (
                              <p className="mt-1 text-[color:var(--on-surface-variant)]">
                                Lý do: {log.result.reason}
                              </p>
                            ) : null}
                            {log.result?.userGuidance ? (
                              <p className="mt-1 text-[color:var(--warning)]">
                                {log.result.userGuidance}
                              </p>
                            ) : null}
                            {log.result?.missingPermissions?.length ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {log.result.missingPermissions.map((permission) => (
                                  <span
                                    key={`${permission.code}-${permission.adminPermission}`}
                                    className="rounded-full bg-[color:var(--warning-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--warning)]"
                                  >
                                    Thiếu quyền: {permission.adminPermission}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {log.result?.operations?.length ? (
                              <div className="mt-2 space-y-2">
                                <div className="flex flex-wrap gap-2">
                                  {log.result.operations.map((operation) => (
                                    <span
                                      key={`${operation.method}-${operation.description ?? "none"}`}
                                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                        operation.ok
                                          ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                                          : "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                                      }`}
                                    >
                                      {formatTelegramMethod(operation.method)}
                                    </span>
                                  ))}
                                </div>
                                <div className="space-y-1">
                                  {log.result.operations.map((operation) => (
                                    <p
                                      key={`${operation.method}-detail-${operation.description ?? "none"}`}
                                      className="text-xs text-[color:var(--on-surface-variant)]"
                                    >
                                      {formatTelegramMethod(operation.method)}:{" "}
                                      {operation.userGuidance ||
                                        operation.description ||
                                        "Kh?ng c? chi ti?t"}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Quyết định thủ công
                </span>
                <select
                  value={manualDecision}
                  onChange={(event) => setManualDecision(event.target.value as SpamDecision)}
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                >
                  <option value="ALLOW">Cho phép</option>
                  <option value="REVIEW">Chờ review</option>
                  <option value="WARN">Cảnh báo</option>
                  <option value="RESTRICT">Restrict / mute</option>
                  <option value="BAN">Ban ngay</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Ghi chú xử lý
                </span>
                <textarea
                  value={manualNote}
                  onChange={(event) => setManualNote(event.target.value)}
                  rows={4}
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                  placeholder="Ghi lại lý do xử lý hoặc hướng theo dõi tiếp theo..."
                />
              </label>

              <button
                onClick={() => void handleApplyAction()}
                disabled={isApplyingAction}
                className="w-full rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {isApplyingAction ? "Đang áp dụng..." : "Áp dụng quyết định"}
              </button>
            </div>
          ) : (
            <div className="mt-5 rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4 text-sm text-[color:var(--on-surface-variant)]">
              Chọn một sự kiện ở bảng bên trái để xem chi tiết.
            </div>
          )}
        </aside>
      </div>

      <div className="grid gap-6">

        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
            Giả lập phân tích
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-tight">
            Thử một message mới để xem engine sẽ chấm điểm ra sao
          </h3>

          <div className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Group
                </span>
                <input
                  value={simulateForm.groupTitle}
                  onChange={(event) =>
                    setSimulateForm((current) => ({
                      ...current,
                      groupTitle: event.target.value,
                    }))
                  }
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Event type
                </span>
                <select
                  value={simulateForm.eventType}
                  onChange={(event) =>
                    setSimulateForm((current) => ({
                      ...current,
                      eventType: event.target.value,
                    }))
                  }
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                >
                  <option value="message_received">message_received</option>
                  <option value="join_request">join_request</option>
                  <option value="user_joined">user_joined</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Campaign
                </span>
                <input
                  value={simulateForm.campaignLabel}
                  onChange={(event) =>
                    setSimulateForm((current) => ({
                      ...current,
                      campaignLabel: event.target.value,
                    }))
                  }
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Username
                </span>
                <input
                  value={simulateForm.actorUsername}
                  onChange={(event) =>
                    setSimulateForm((current) => ({
                      ...current,
                      actorUsername: event.target.value,
                    }))
                  }
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                Nội dung
              </span>
              <textarea
                value={simulateForm.messageText}
                onChange={(event) =>
                  setSimulateForm((current) => ({
                    ...current,
                    messageText: event.target.value,
                  }))
                }
                rows={6}
                className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              />
            </label>

            <button
              onClick={() => void handleSimulate()}
              disabled={isSimulating}
              className="rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {isSimulating ? "Đang phân tích..." : "Chạy phân tích thử"}
            </button>

            {simulateResult ? (
              <div className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black">{simulateResult.decisionLabel}</p>
                    <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                      Scope áp dụng: {simulateResult.policyLabel} · AI: {simulateResult.aiProvider}
                    </p>
                  </div>
                  {simulateResult.warningContext ? (
                    <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                      Cảnh báo: {simulateResult.warningContext.nextWarningCount}/
                      {simulateResult.warningContext.warnLimit}
                      {simulateResult.warningContext.triggered
                        ? ` · nâng mức ${simulateResult.warningContext.warnAction}`
                        : ""}
                    </p>
                  ) : null}
                  <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold">
                    Điểm {simulateResult.finalScore}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {simulateResult.matchedRules.map((rule) => (
                    <span
                      key={rule}
                      className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[color:var(--on-surface-variant)]"
                    >
                      {rule}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
            Lệnh quản trị
          </p>
          <h3 className="mt-2 text-2xl font-black tracking-tight">
            Giả lập command để test local trước khi đẩy lên domain
          </h3>

          <div className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Group
                </span>
                <input
                  value={commandForm.groupTitle}
                  onChange={(event) =>
                    setCommandForm((current) => ({
                      ...current,
                      groupTitle: event.target.value,
                    }))
                  }
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Command
                </span>
                <input
                  value={commandForm.commandText}
                  onChange={(event) =>
                    setCommandForm((current) => ({
                      ...current,
                      commandText: event.target.value,
                    }))
                  }
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Target username
                </span>
                <input
                  value={commandForm.targetUsername}
                  onChange={(event) =>
                    setCommandForm((current) => ({
                      ...current,
                      targetUsername: event.target.value,
                    }))
                  }
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                  Target external id
                </span>
                <input
                  value={commandForm.targetExternalId}
                  onChange={(event) =>
                    setCommandForm((current) => ({
                      ...current,
                      targetExternalId: event.target.value,
                    }))
                  }
                  className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                Ghi chú
              </span>
              <textarea
                value={commandForm.note}
                onChange={(event) =>
                  setCommandForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                rows={3}
                className="w-full rounded-[18px] bg-[color:var(--surface-low)] px-4 py-4 text-sm outline-none"
              />
            </label>

            <button
              onClick={() => void handleExecuteCommand()}
              disabled={isRunningCommand}
              className="rounded-[18px] bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {isRunningCommand ? "Đang chạy command..." : "Chạy command từ CRM"}
            </button>

            {commandResult ? (
              <div className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4 text-sm">
                <p className="font-bold">
                  {commandResult.command?.rawText ?? commandForm.commandText}
                </p>
                <p className="mt-2 text-[color:var(--on-surface-variant)]">
                  {commandResult.reason ?? "Đã ghi command vào workflow moderation."}
                </p>
                {commandResult.action?.actionVariant ? (
                  <p className="mt-2 text-[color:var(--on-surface-variant)]">
                    Action variant: {commandResult.action.actionVariant}
                  </p>
                ) : null}
                {commandResult.action?.scheduledJobs?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {commandResult.action.scheduledJobs.map((job) => (
                      <span
                        key={job.id}
                        className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[color:var(--on-surface)]"
                      >
                        {job.actionVariant} hết hạn lúc {formatDateTime(job.expiresAt)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Debug / Audit
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-tight">
                Theo dõi hàng đợi action và log moderation
              </h3>
            </div>
            <button
              onClick={() => void handleProcessDueJobs()}
              disabled={isProcessingJobs}
              className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold"
            >
              {isProcessingJobs ? "Đang xử lý..." : "Chạy action đến hạn"}
            </button>
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4">
              <p className="text-sm font-bold">Hàng đợi temp action</p>
              <div className="mt-3 space-y-3">
                {debugOverview?.jobs.length ? (
                  debugOverview.jobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-[16px] bg-white/80 px-3 py-3 text-sm"
                    >
                      <p className="font-semibold">
                        {job.actionVariant} · {job.status}
                      </p>
                      <p className="mt-1 text-[color:var(--on-surface-variant)]">
                        {job.groupTitle ?? job.chatId} · user {job.userId}
                      </p>
                      <p className="mt-1 text-[color:var(--on-surface-variant)]">
                        Hết hạn: {formatDateTime(job.expireAt)}
                      </p>
                      {job.lastError ? (
                        <p className="mt-1 text-[color:var(--danger)]">{job.lastError}</p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[color:var(--on-surface-variant)]">
                    Chưa có temp action nào trong hàng đợi.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4">
              <p className="text-sm font-bold">Nhật ký hệ thống gần nhất</p>
              <div className="mt-3 space-y-3">
                {debugOverview?.logs.length ? (
                  debugOverview.logs.slice(0, 12).map((log) => (
                    <div
                      key={log.id}
                      className="rounded-[16px] bg-white/80 px-3 py-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold">{log.message}</p>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            log.level === "ERROR"
                              ? "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                              : log.level === "WARN"
                                ? "bg-[color:var(--warning-soft)] text-[color:var(--warning)]"
                                : "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                          }`}
                        >
                          {log.level}
                        </span>
                      </div>
                      <p className="mt-1 text-[color:var(--on-surface-variant)]">
                        {log.scope} · {log.action} · {formatDateTime(log.createdAt)}
                      </p>
                      {log.detail ? (
                        <p className="mt-1 text-[color:var(--on-surface-variant)]">
                          {log.detail}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[color:var(--on-surface-variant)]">
                    Chưa có log nào để hiển thị.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-bold">Webhook JSON thô</p>
                <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                  Chọn webhook gần nhất để xem và copy payload raw.
                </p>
              </div>
              {selectedRawLog?.payload ? (
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard.writeText(formatJsonPayload(selectedRawLog.payload))
                  }
                  className="rounded-full bg-white/80 px-4 py-2 text-xs font-bold text-[color:var(--primary)]"
                >
                  Copy JSON
                </button>
              ) : null}
            </div>

            {rawWebhookLogs.length ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-3">
                  {rawWebhookLogs.slice(0, 8).map((log) => (
                    <button
                      key={log.id}
                      type="button"
                      onClick={() => setSelectedRawLogId(log.id)}
                      className={`block w-full rounded-[16px] px-3 py-3 text-left text-sm ${
                        selectedRawLog?.id === log.id
                          ? "bg-[color:var(--primary-soft)] text-[color:var(--on-surface)]"
                          : "bg-white/80 text-[color:var(--on-surface)]"
                      }`}
                    >
                      <p className="font-semibold">{log.message}</p>
                      <p className="mt-1 text-[color:var(--on-surface-variant)]">
                        {formatDateTime(log.createdAt)}
                      </p>
                    </button>
                  ))}
                </div>

                <pre className="overflow-x-auto rounded-[16px] bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
                  {selectedRawLog?.payload ? formatJsonPayload(selectedRawLog.payload) : "{}"}
                </pre>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[color:var(--on-surface-variant)]">
                Chưa có webhook nào chứa JSON raw để hiển thị.
              </p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
