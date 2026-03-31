"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const apiBaseUrl = "/api";

type CampaignItem = {
  id: string;
  name: string;
  channel: string;
  inviteCode: string;
  joinRate: string;
  status: "Active" | "Paused" | "Review";
  conversionRate: number;
  joinedCount: number;
  leftCount: number;
  activeCount: number;
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

function getStatusLabel(status: CampaignItem["status"]) {
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

export function CampaignsWorkbench() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await fetchJson<CampaignItem[]>(`${apiBaseUrl}/campaigns`);
        if (!active) {
          return;
        }

        setCampaigns(data);
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Không thể tải danh sách campaign.",
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
  }, []);

  const summary = campaigns.reduce(
    (accumulator, campaign) => ({
      total: accumulator.total + 1,
      joined: accumulator.joined + campaign.joinedCount,
      active: accumulator.active + campaign.activeCount,
      left: accumulator.left + campaign.leftCount,
    }),
    { total: 0, joined: 0, active: 0, left: 0 },
  );

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Tổng campaign", summary.total],
          ["Đã tham gia", summary.joined],
          ["Đang ở lại", summary.active],
          ["Đã rời đi", summary.left],
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

      <section className="rounded-[32px] bg-[color:var(--surface-card)] p-7 shadow-[0_8px_32px_rgba(42,52,57,0.04)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--on-surface-variant)]">
              Campaign đang chạy
            </p>
            <h3 className="mt-2 text-2xl font-black tracking-tight">
              Theo dõi số vào nhóm, còn ở lại và đã rời ngay trên từng chiến dịch
            </h3>
          </div>
          <div className="rounded-full bg-[color:var(--surface-low)] px-4 py-2 text-sm font-semibold text-[color:var(--on-surface-variant)]">
            {campaigns.length} campaign
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-[18px] bg-[color:var(--danger-soft)] px-4 py-3 text-sm text-[color:var(--danger)]">
            {error}
          </div>
        ) : null}

        <div className="mt-6 overflow-x-auto rounded-[24px] bg-[color:var(--surface-low)]">
          <table className="min-w-[900px] w-full border-collapse text-left">
            <thead>
              <tr className="text-xs uppercase tracking-[0.16em] text-[color:var(--on-surface-variant)]">
                <th className="px-5 py-4 font-semibold">Campaign</th>
                <th className="px-5 py-4 font-semibold">Kênh</th>
                <th className="px-5 py-4 font-semibold">Đã tham gia</th>
                <th className="px-5 py-4 font-semibold">Đang ở lại</th>
                <th className="px-5 py-4 font-semibold">Đã rời</th>
                <th className="px-5 py-4 font-semibold">Link mời</th>
                <th className="px-5 py-4 font-semibold">Trạng thái</th>
                <th className="px-5 py-4 font-semibold">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign, index) => (
                <tr key={campaign.id} className={index % 2 === 1 ? "bg-white/70" : ""}>
                  <td className="px-5 py-4 align-top">
                    <p className="text-sm font-bold">{campaign.name}</p>
                    <p className="mt-1 text-sm text-[color:var(--on-surface-variant)]">
                      Chuyển đổi {campaign.conversionRate}%
                    </p>
                  </td>
                  <td className="px-5 py-4 align-top text-sm text-[color:var(--on-surface-variant)]">
                    {campaign.channel}
                  </td>
                  <td className="px-5 py-4 align-top text-sm font-semibold">
                    {campaign.joinedCount}
                  </td>
                  <td className="px-5 py-4 align-top text-sm font-semibold text-[color:var(--success)]">
                    {campaign.activeCount}
                  </td>
                  <td className="px-5 py-4 align-top text-sm font-semibold text-[color:var(--danger)]">
                    {campaign.leftCount}
                  </td>
                  <td className="px-5 py-4 align-top text-sm font-mono text-[color:var(--primary)]">
                    {campaign.inviteCode}
                  </td>
                  <td className="px-5 py-4 align-top text-sm">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                        campaign.status === "Active"
                          ? "bg-[color:var(--success-soft)] text-[color:var(--success)]"
                          : campaign.status === "Review"
                            ? "bg-[color:var(--warning-soft)] text-[color:var(--warning)]"
                            : "bg-[color:var(--danger-soft)] text-[color:var(--danger)]"
                      }`}
                    >
                      {getStatusLabel(campaign.status)}
                    </span>
                  </td>
                  <td className="px-5 py-4 align-top text-sm">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="inline-flex rounded-full bg-[color:var(--surface-card)] px-4 py-2 font-semibold text-[color:var(--primary)] shadow-[0_4px_14px_rgba(42,52,57,0.08)]"
                    >
                      Xem campaign
                    </Link>
                  </td>
                </tr>
              ))}

              {!isLoading && !campaigns.length ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-sm text-[color:var(--on-surface-variant)]"
                  >
                    Chưa có campaign nào.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
