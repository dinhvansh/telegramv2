"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const apiBaseUrl = "/api";

type CampaignMember = {
  id: string;
  displayName: string;
  username: string | null;
  ownerName: string | null;
  membershipStatus: "active" | "left";
};

type CampaignDetail = {
  id: string;
  name: string;
  channel: string;
  inviteCode: string;
  status: string;
  joinRate: string;
  conversionRate: number;
  telegramGroupTitle: string;
  summary: {
    joinedCount: number;
    activeCount: number;
    leftCount: number;
  };
  inviteLinks: Array<{
    id: string;
    label: string;
    inviteUrl: string;
    memberLimit: number | null;
    joinedCount: number;
    leftCount: number;
    pendingCount: number;
  }>;
  members: CampaignMember[];
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

function getStatusLabel(status: string) {
  switch (status) {
    case "Active":
      return "Đang chạy";
    case "Paused":
      return "Tạm dừng";
    case "Review":
      return "Đang rà soát";
    default:
      return status;
  }
}

export function CampaignDetailView({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await fetchJson<CampaignDetail>(`${apiBaseUrl}/campaigns/${campaignId}`);
        if (!active) {
          return;
        }

        setCampaign(data);
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Không thể tải chi tiết campaign.",
        );
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [campaignId]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface)] text-[color:var(--on-surface)]">
        <div className="rounded-[28px] bg-[color:var(--surface-card)] px-8 py-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--on-surface-variant)]">
            Campaign
          </p>
          <p className="mt-3 text-lg font-black">Đang tải chi tiết campaign...</p>
        </div>
      </div>
    );
  }

  if (!campaign || error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface)] px-5 text-[color:var(--on-surface)]">
        <div className="max-w-xl rounded-[32px] bg-[color:var(--surface-card)] p-8 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <p className="text-sm font-semibold text-[color:var(--danger)]">
            {error ?? "Không tìm thấy campaign."}
          </p>
          <Link
            href="/campaigns"
            className="mt-5 inline-flex rounded-full bg-[color:var(--surface-low)] px-4 py-3 text-sm font-semibold"
          >
            Quay lại Campaign
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--surface)] px-5 py-8 text-[color:var(--on-surface)] lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
                Chi tiết campaign
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">{campaign.name}</h1>
              <p className="mt-3 text-sm leading-7 text-[color:var(--on-surface-variant)]">
                Group đích: {campaign.telegramGroupTitle} · Trạng thái:{" "}
                {getStatusLabel(campaign.status)}
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/campaigns"
                className="rounded-full bg-[color:var(--surface-low)] px-4 py-3 text-sm font-semibold"
              >
                Quay lại Campaign
              </Link>
              <Link
                href={`/members?campaignId=${campaign.id}`}
                className="rounded-full bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-dim)_100%)] px-5 py-3 text-sm font-bold text-white"
              >
                Mở menu Thành viên
              </Link>
            </div>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Đã tham gia", campaign.summary.joinedCount],
            ["Đang ở lại", campaign.summary.activeCount],
            ["Đã rời đi", campaign.summary.leftCount],
            ["Chuyển đổi", `${campaign.conversionRate}%`],
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

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
              Link mời
            </p>
            <div className="mt-5 space-y-4">
              {campaign.inviteLinks.map((inviteLink) => (
                <div
                  key={inviteLink.id}
                  className="rounded-[22px] bg-[color:var(--surface-low)] px-4 py-4"
                >
                  <p className="text-sm font-bold">{inviteLink.label}</p>
                  <p className="mt-1 text-sm font-mono text-[color:var(--primary)]">
                    {inviteLink.inviteUrl}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-[color:var(--on-surface-variant)]">
                    <span>Đã vào: {inviteLink.joinedCount}</span>
                    <span>Đã rời: {inviteLink.leftCount}</span>
                    <span>Chờ duyệt: {inviteLink.pendingCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
              Thành viên mới nhất
            </p>
            <div className="mt-5 overflow-hidden rounded-[24px] bg-[color:var(--surface-low)]">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                    <th className="px-5 py-4 font-semibold">User</th>
                    <th className="px-5 py-4 font-semibold">Trạng thái</th>
                    <th className="px-5 py-4 font-semibold">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {campaign.members.map((member, index) => (
                    <tr key={member.id} className={index % 2 === 1 ? "bg-white/70" : ""}>
                      <td className="px-5 py-4 align-top">
                        <p className="text-sm font-bold">{member.displayName}</p>
                        <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                          @{member.username ?? "không có username"}
                        </p>
                      </td>
                      <td className="px-5 py-4 align-top text-sm">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                            member.membershipStatus === "active"
                              ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                              : "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                          }`}
                        >
                          {member.membershipStatus === "active"
                            ? "Đang ở trong nhóm"
                            : "Đã rời nhóm"}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-top text-sm">
                        {member.ownerName ?? "Chưa gán"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
