export type NavItem = {
  id: string;
  label: string;
  icon: string;
  description: string;
};

export type MetricCard = {
  label: string;
  value: string;
  trend: string;
  tone: "primary" | "success" | "warning" | "danger";
};

export type Campaign = {
  name: string;
  channel: string;
  inviteCode: string;
  targetCount: number;
  joinedCount: number;
  activeCount: number;
  leftCount: number;
  status: "Active" | "Paused" | "Review";
};

export type EventFeedItem = {
  time: string;
  title: string;
  detail: string;
  tone: "primary" | "success" | "warning" | "danger";
};

export type RoleCard = {
  title: string;
  detail: string;
};

export type AutopostCapability = {
  title: string;
  detail: string;
};

export type RoadmapPhase = {
  phase: string;
  outcome: string;
  tasks: string[];
};

export type PlatformSnapshot = {
  navItems: NavItem[];
  metrics: MetricCard[];
  campaigns: Campaign[];
  eventFeed: EventFeedItem[];
  botSummary: {
    botName: string;
    botExternalId: string | null;
    activeGroupCount: number;
    totalGroupCount: number;
    webhookRegistered: boolean;
  };
  groupInsights: Array<{
    title: string;
    memberCount: number;
    monthlyJoins: number;
    previousMonthlyJoins: number;
    growthRate: number;
    activeUsers: number;
    activityRate: number;
  }>;
  moderationRules: string[];
  roadmap: RoadmapPhase[];
  autopostCapabilities: AutopostCapability[];
  roles: RoleCard[];
  settings: Record<string, string>;
};

export const fallbackPlatformSnapshot: PlatformSnapshot = {
  navItems: [
    {
      id: "overview",
      label: "Tổng quan",
      icon: "◫",
      description: "KPI, sức khỏe hệ thống và tín hiệu vận hành.",
    },
    {
      id: "campaigns",
      label: "Chiến dịch",
      icon: "✦",
      description: "Quản lý campaign, invite link và tăng trưởng.",
    },
    {
      id: "moderation",
      label: "Người dùng & Spam",
      icon: "⛨",
      description: "Theo dõi join mới, rule chống spam và review.",
    },
    {
      id: "autopost",
      label: "Autopost",
      icon: "↗",
      description: "Lịch gửi bài, template và log điều phối.",
    },
    {
      id: "roles",
      label: "Phân quyền",
      icon: "⌘",
      description: "RBAC, vai trò và phân cấp vận hành.",
    },
    {
      id: "settings",
      label: "Cài đặt",
      icon: "⚙",
      description: "Bot token, bảo mật, thông báo và cấu hình hệ thống.",
    },
  ],
  metrics: [
    { label: "Join mới trong ngày", value: "12,482", trend: "+18.4%", tone: "primary" },
    { label: "Invite link đang chạy", value: "156", trend: "85% healthy", tone: "success" },
    { label: "Autopost đã gửi", value: "45,102", trend: "24 lịch active", tone: "warning" },
    { label: "Spam đã chặn", value: "3,209", trend: "Mức cảnh báo cao", tone: "danger" },
  ],
  campaigns: [
    {
      name: "Summer Growth 2026",
      channel: "Nexus Global",
      inviteCode: "t.me/+AbX92Nexus",
      targetCount: 100,
      joinedCount: 84,
      activeCount: 72,
      leftCount: 12,
      status: "Active",
    },
    {
      name: "Partner Referral East",
      channel: "Partner Circle",
      inviteCode: "t.me/+KqP11Orbit",
      targetCount: 100,
      joinedCount: 61,
      activeCount: 52,
      leftCount: 9,
      status: "Active",
    },
    {
      name: "VIP Re-engagement",
      channel: "Inner Room",
      inviteCode: "t.me/+R9s11Pulse",
      targetCount: 24,
      joinedCount: 10,
      activeCount: 6,
      leftCount: 4,
      status: "Review",
    },
    {
      name: "Flash Promo Hold",
      channel: "Alpha Testers",
      inviteCode: "t.me/+M2c44Queue",
      targetCount: 50,
      joinedCount: 12,
      activeCount: 8,
      leftCount: 4,
      status: "Paused",
    },
  ],
  eventFeed: [
    {
      time: "23:14",
      title: "Worker đã xử lý user_joined",
      detail: "31 thành viên mới được map đúng campaign Summer Growth 2026.",
      tone: "success",
    },
    {
      time: "22:58",
      title: "manual_review_required",
      detail: "3 tài khoản mới chứa link rút gọn và risk score vượt ngưỡng 72.",
      tone: "danger",
    },
    {
      time: "22:42",
      title: "autopost_failed",
      detail: "1 job Telegram bị giới hạn tốc độ, đang retry lần 2.",
      tone: "warning",
    },
    {
      time: "22:30",
      title: "campaign_metric_updated",
      detail: "Campaign Partner Referral East tăng thêm 112 joins trong 40 phút.",
      tone: "primary",
    },
  ],
  botSummary: {
    botName: "SkynetBot",
    botExternalId: "7858331890",
    activeGroupCount: 4,
    totalGroupCount: 4,
    webhookRegistered: true,
  },
  groupInsights: [
    {
      title: "Nexus Global",
      memberCount: 72,
      monthlyJoins: 18,
      previousMonthlyJoins: 12,
      growthRate: 50,
      activeUsers: 31,
      activityRate: 43.1,
    },
    {
      title: "Partner Circle",
      memberCount: 52,
      monthlyJoins: 11,
      previousMonthlyJoins: 10,
      growthRate: 10,
      activeUsers: 18,
      activityRate: 34.6,
    },
    {
      title: "Inner Room",
      memberCount: 6,
      monthlyJoins: 4,
      previousMonthlyJoins: 2,
      growthRate: 100,
      activeUsers: 3,
      activityRate: 50,
    },
    {
      title: "Alpha Testers",
      memberCount: 8,
      monthlyJoins: 2,
      previousMonthlyJoins: 5,
      growthRate: -60,
      activeUsers: 2,
      activityRate: 25,
    },
  ],
  moderationRules: [
    "Chặn link ngoài danh sách whitelist và domain blacklist.",
    "Siết review/join request cho member mới và chỉ restrict khi rule thực sự kích hoạt.",
    "Tính risk score từ keyword, link, history và AI moderation.",
    "Đẩy event vào moderation room thay vì xử lý nặng ngay trong webhook.",
  ],
  roadmap: [
    {
      phase: "Phase 0-2",
      outcome: "Chuẩn hóa tài liệu, repo và schema nền tảng.",
      tasks: [
        "Chuẩn hóa UTF-8 cho toàn bộ tài liệu tiếng Việt.",
        "Chốt workspace apps/web, apps/api, packages và docs.",
        "Thiết kế schema cho users, campaigns, invite links, spam, autopost và analytics.",
      ],
    },
    {
      phase: "Phase 3-5",
      outcome: "Dựng frontend shell, auth RBAC và Telegram core integration.",
      tasks: [
        "Xây admin shell theo Digital Command design system.",
        "Thêm login, role, permission guard và navigation theo quyền.",
        "Thêm bot token config, Telegram service wrapper và webhook receiver.",
      ],
    },
    {
      phase: "Phase 6-9",
      outcome: "Ship campaign, tracking, dashboard và autopost.",
      tasks: [
        "Tạo campaign CRUD và invite link generation.",
        "Map user join qua queue và worker để cập nhật metrics.",
        "Xây dashboard analytics và autopost scheduling với log gửi bài.",
      ],
    },
    {
      phase: "Phase 10-13",
      outcome: "Hoàn thiện moderation, realtime, AI và hardening.",
      tasks: [
        "Thêm anti-spam rule engine, blocked users và moderation panel.",
        "Emit WebSocket events cho dashboard, moderation và autopost.",
        "Mở rộng AI moderation, security hardening và production readiness.",
      ],
    },
  ],
  autopostCapabilities: [
    {
      title: "Template",
      detail: "Thông báo bản phát hành, cảnh báo hệ thống, nội dung campaign.",
    },
    {
      title: "Schedule",
      detail: "Một lần, định kỳ, theo slot hoặc theo workflow campaign.",
    },
    {
      title: "Target",
      detail: "Telegram groups, channels và kiến trúc sẵn sàng cho multi-platform.",
    },
    {
      title: "Logs",
      detail: "Sent, failed, retried và thời gian phản hồi từng kênh.",
    },
  ],
  roles: [
    { title: "Admin", detail: "Toàn quyền cấu hình bot, policy, queue và analytics." },
    { title: "Moderator", detail: "Review spam, mute, ban và xử lý manual review." },
    { title: "Operator", detail: "Quản lý campaign, autopost và theo dõi tăng trưởng." },
  ],
  settings: {
    "system.name": "Telegram Operations Platform",
    "security.2fa": "required-for-admins",
    "websocket.strategy": "socket-io-with-room-auth",
  },
};
