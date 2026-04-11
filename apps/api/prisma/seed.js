const bcrypt = require('bcryptjs');
const {
  PrismaClient,
  CampaignStatus,
  EventTone,
  UserStatus,
} = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const seedIfEmpty = process.argv.includes('--if-empty');
  if (seedIfEmpty) {
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      console.log('Seed skipped: database already initialized.');
      return;
    }
  }

  await prisma.rolePermission.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.workspaceMembership.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.user.deleteMany();
  await prisma.autopostLog.deleteMany();
  await prisma.autopostSchedule.deleteMany();
  await prisma.autopostTarget.deleteMany();
  await prisma.inviteLinkEvent.deleteMany();
  await prisma.campaignInviteLink.deleteMany();
  await prisma.telegramGroupModerationSettings.deleteMany();
  await prisma.telegramBotConfig.deleteMany();
  await prisma.eventFeedItem.deleteMany();
  await prisma.groupMembershipSession.deleteMany();
  await prisma.communityMember.deleteMany();
  await prisma.telegramUser.deleteMany();
  await prisma.metricCard.deleteMany();
  await prisma.moderationDomain.deleteMany();
  await prisma.moderationKeyword.deleteMany();
  await prisma.moderationPolicy.deleteMany();
  await prisma.moderationRule.deleteMany();
  await prisma.spamEvent.deleteMany();
  await prisma.moderationActionJob.deleteMany();
  await prisma.roadmapTask.deleteMany();
  await prisma.roadmapPhase.deleteMany();
  await prisma.autopostCapability.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.telegramGroup.deleteMany();
  await prisma.telegramBot.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.systemLog.deleteMany();
  await prisma.systemSetting.deleteMany();

  const defaultOrganization = await prisma.organization.create({
    data: {
      name: 'Default Organization',
      slug: 'default-organization',
      isActive: true,
    },
  });

  const defaultWorkspace = await prisma.workspace.create({
    data: {
      organizationId: defaultOrganization.id,
      name: 'Default Workspace',
      slug: 'default-workspace',
      description: 'Backfilled workspace for current single-bot setup',
      isActive: true,
    },
  });

  const affiliateWorkspace = await prisma.workspace.create({
    data: {
      organizationId: defaultOrganization.id,
      name: 'Affiliate Workspace',
      slug: 'affiliate-workspace',
      description: 'Workspace sample for local multi-workspace testing',
      isActive: true,
    },
  });

  const [globalGroup, partnerGroup, vipGroup, alphaGroup] = await Promise.all([
    prisma.telegramGroup.create({
      data: {
        organizationId: defaultOrganization.id,
        workspaceId: defaultWorkspace.id,
        title: 'Nexus Global',
        slug: 'nexus-global',
        externalId: '-100221001',
        username: 'nexus_global',
        type: 'supergroup',
        isActive: true,
        discoveredFrom: 'seed_import',
        lastSyncedAt: new Date(),
        botMemberState: 'administrator',
        botCanDeleteMessages: true,
        botCanRestrictMembers: true,
        botCanInviteUsers: true,
      },
    }),
    prisma.telegramGroup.create({
      data: {
        organizationId: defaultOrganization.id,
        workspaceId: defaultWorkspace.id,
        title: 'Partner Circle',
        slug: 'partner-circle',
        externalId: '-100221002',
        username: 'partner_circle',
        type: 'supergroup',
        isActive: true,
        discoveredFrom: 'seed_import',
        lastSyncedAt: new Date(),
        botMemberState: 'administrator',
        botCanDeleteMessages: true,
        botCanRestrictMembers: true,
        botCanInviteUsers: true,
      },
    }),
    prisma.telegramGroup.create({
      data: {
        organizationId: defaultOrganization.id,
        workspaceId: defaultWorkspace.id,
        title: 'Inner Room',
        slug: 'inner-room',
        externalId: '-100221003',
        username: 'inner_room',
        type: 'supergroup',
        isActive: true,
        discoveredFrom: 'seed_import',
        lastSyncedAt: new Date(),
        botMemberState: 'administrator',
        botCanDeleteMessages: true,
        botCanRestrictMembers: true,
        botCanInviteUsers: true,
      },
    }),
    prisma.telegramGroup.create({
      data: {
        organizationId: defaultOrganization.id,
        workspaceId: defaultWorkspace.id,
        title: 'Alpha Testers',
        slug: 'alpha-testers',
        externalId: '-100221004',
        username: 'alpha_testers',
        type: 'supergroup',
        isActive: true,
        discoveredFrom: 'seed_import',
        lastSyncedAt: new Date(),
        botMemberState: 'member',
        botCanDeleteMessages: false,
        botCanRestrictMembers: false,
        botCanInviteUsers: false,
      },
    }),
  ]);

  const affiliateGroup = await prisma.telegramGroup.create({
    data: {
      organizationId: defaultOrganization.id,
      workspaceId: affiliateWorkspace.id,
      title: 'Affiliate Hub',
      slug: 'affiliate-hub',
      externalId: '-100221099',
      username: 'affiliate_hub',
      type: 'supergroup',
      isActive: true,
      discoveredFrom: 'seed_import',
      lastSyncedAt: new Date(),
      botMemberState: 'administrator',
      botCanDeleteMessages: true,
      botCanRestrictMembers: true,
      botCanInviteUsers: true,
    },
  });

  await prisma.telegramBotConfig.create({
    data: {
      botExternalId: '100000001',
      botUsername: 'nexus_guard_bot',
      botDisplayName: 'Nexus Guard',
      isVerified: true,
      webhookRegistered: false,
      webhookUrl: null,
      lastVerifiedAt: new Date(),
      lastDiscoveredAt: new Date(),
    },
  });

  const defaultTelegramBot = await prisma.telegramBot.create({
    data: {
      organizationId: defaultOrganization.id,
      workspaceId: defaultWorkspace.id,
      legacyConfigKey: 'default',
      externalId: '100000001',
      username: 'nexus_guard_bot',
      displayName: 'Nexus Guard',
      label: 'Nexus Guard',
      isActive: true,
      isVerified: true,
      webhookRegistered: false,
      lastVerifiedAt: new Date(),
      lastDiscoveredAt: new Date(),
    },
  });

  const affiliateTelegramBot = await prisma.telegramBot.create({
    data: {
      organizationId: defaultOrganization.id,
      workspaceId: affiliateWorkspace.id,
      legacyConfigKey: 'affiliate',
      externalId: '100000099',
      username: 'affiliate_guard_bot',
      displayName: 'Affiliate Guard',
      label: 'Affiliate Guard',
      isActive: true,
      isVerified: true,
      webhookRegistered: false,
      lastVerifiedAt: new Date(),
      lastDiscoveredAt: new Date(),
    },
  });

  await prisma.telegramGroup.updateMany({
    where: {
      id: {
        in: [globalGroup.id, partnerGroup.id, vipGroup.id, alphaGroup.id],
      },
    },
    data: {
      telegramBotId: defaultTelegramBot.id,
    },
  });

  await prisma.telegramGroup.update({
    where: {
      id: affiliateGroup.id,
    },
    data: {
      telegramBotId: affiliateTelegramBot.id,
    },
  });

  await prisma.telegramGroupModerationSettings.createMany({
    data: [
      {
        telegramGroupId: globalGroup.id,
        moderationEnabled: true,
        lockUrl: true,
        lockInvitelink: true,
        lockForward: true,
      },
      {
        telegramGroupId: partnerGroup.id,
        moderationEnabled: true,
        lockUrl: true,
        lockInvitelink: true,
      },
      {
        telegramGroupId: vipGroup.id,
        moderationEnabled: false,
      },
      {
        telegramGroupId: alphaGroup.id,
        moderationEnabled: false,
      },
      {
        telegramGroupId: affiliateGroup.id,
        moderationEnabled: true,
        lockUrl: true,
        lockInvitelink: true,
        lockForward: true,
      },
    ],
  });

  const [globalModerationPolicy, partnerModerationPolicy, vipModerationPolicy] =
    await Promise.all([
      prisma.moderationPolicy.create({
        data: {
          scopeKey: 'global',
          scopeType: 'GLOBAL',
          scopeLabel: 'Mặc định toàn hệ thống',
          autoBanSpam: true,
          muteNewMembers: true,
          muteDurationHours: 24,
        },
      }),
      prisma.moderationPolicy.create({
        data: {
          scopeKey: `group:${partnerGroup.id}`,
          scopeType: 'GROUP',
          scopeLabel: partnerGroup.title,
          autoBanSpam: false,
          muteNewMembers: true,
          muteDurationHours: 12,
          telegramGroupId: partnerGroup.id,
        },
      }),
      prisma.moderationPolicy.create({
        data: {
          scopeKey: `group:${vipGroup.id}`,
          scopeType: 'GROUP',
          scopeLabel: vipGroup.title,
          autoBanSpam: true,
          muteNewMembers: false,
          muteDurationHours: 6,
          telegramGroupId: vipGroup.id,
        },
      }),
    ]);

  await prisma.moderationKeyword.createMany({
    data: [
      {
        moderationPolicyId: globalModerationPolicy.id,
        value: 'crypto_bot',
        normalizedValue: 'crypto_bot',
      },
      {
        moderationPolicyId: globalModerationPolicy.id,
        value: 'airdrop',
        normalizedValue: 'airdrop',
      },
      {
        moderationPolicyId: globalModerationPolicy.id,
        value: 'seed phrase',
        normalizedValue: 'seed phrase',
      },
      {
        moderationPolicyId: globalModerationPolicy.id,
        value: 'wallet connect',
        normalizedValue: 'wallet connect',
      },
      {
        moderationPolicyId: partnerModerationPolicy.id,
        value: 'partner bonus',
        normalizedValue: 'partner bonus',
      },
      {
        moderationPolicyId: vipModerationPolicy.id,
        value: 'vip unlock',
        normalizedValue: 'vip unlock',
      },
    ],
  });

  await prisma.moderationDomain.createMany({
    data: [
      {
        moderationPolicyId: globalModerationPolicy.id,
        value: 'bit.ly',
        normalizedValue: 'bit.ly',
        mode: 'BLOCK',
      },
      {
        moderationPolicyId: globalModerationPolicy.id,
        value: 'tinyurl.com',
        normalizedValue: 'tinyurl.com',
        mode: 'BLOCK',
      },
      {
        moderationPolicyId: partnerModerationPolicy.id,
        value: 'partners.nexus.local',
        normalizedValue: 'partners.nexus.local',
        mode: 'ALLOW',
      },
      {
        moderationPolicyId: vipModerationPolicy.id,
        value: 'vip.nexus.local',
        normalizedValue: 'vip.nexus.local',
        mode: 'ALLOW',
      },
    ],
  });

  await prisma.campaign.createMany({
    data: [
      {
        organizationId: defaultOrganization.id,
        workspaceId: defaultWorkspace.id,
        telegramBotId: defaultTelegramBot.id,
        name: 'Summer Growth 2026',
        channel: 'Nexus Global',
        inviteCode: 't.me/+AbX92Nexus',
        joinRate: '84% conversion',
        status: CampaignStatus.ACTIVE,
        conversionRate: 84,
        telegramGroupId: globalGroup.id,
      },
      {
        organizationId: defaultOrganization.id,
        workspaceId: defaultWorkspace.id,
        telegramBotId: defaultTelegramBot.id,
        name: 'Partner Referral East',
        channel: 'Partner Circle',
        inviteCode: 't.me/+KqP11Orbit',
        joinRate: '61% conversion',
        status: CampaignStatus.ACTIVE,
        conversionRate: 61,
        telegramGroupId: partnerGroup.id,
      },
      {
        organizationId: defaultOrganization.id,
        workspaceId: defaultWorkspace.id,
        telegramBotId: defaultTelegramBot.id,
        name: 'VIP Re-engagement',
        channel: 'Inner Room',
        inviteCode: 't.me/+R9s11Pulse',
        joinRate: 'Manual approval',
        status: CampaignStatus.REVIEW,
        conversionRate: 42,
        telegramGroupId: vipGroup.id,
      },
      {
        organizationId: defaultOrganization.id,
        workspaceId: defaultWorkspace.id,
        telegramBotId: defaultTelegramBot.id,
        name: 'Flash Promo Hold',
        channel: 'Alpha Testers',
        inviteCode: 't.me/+M2c44Queue',
        joinRate: '12% conversion',
        status: CampaignStatus.PAUSED,
        conversionRate: 12,
        telegramGroupId: alphaGroup.id,
      },
      {
        organizationId: defaultOrganization.id,
        workspaceId: affiliateWorkspace.id,
        telegramBotId: affiliateTelegramBot.id,
        name: 'Affiliate Burst VN',
        channel: 'Affiliate Hub',
        inviteCode: 't.me/+AffBurstVN',
        joinRate: '73% conversion',
        status: CampaignStatus.ACTIVE,
        conversionRate: 73,
        telegramGroupId: affiliateGroup.id,
      },
    ],
  });

  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: 'asc' },
  });
  const [summerCampaign, partnerCampaign, vipCampaign, , affiliateCampaign] = campaigns;

  const inviteLinks = await Promise.all([
    prisma.campaignInviteLink.create({
      data: {
        campaignId: summerCampaign.id,
        telegramGroupId: globalGroup.id,
        externalInviteId: 'summer-growth-2026-a',
        inviteUrl: 'https://t.me/+AbX92Nexus',
        label: 'Summer Growth 2026 / Direct',
        memberLimit: 500,
        createsJoinRequest: false,
      },
    }),
    prisma.campaignInviteLink.create({
      data: {
        campaignId: partnerCampaign.id,
        telegramGroupId: partnerGroup.id,
        externalInviteId: 'partner-east-review',
        inviteUrl: 'https://t.me/+KqP11Orbit',
        label: 'Partner Referral East / Review',
        memberLimit: 250,
        createsJoinRequest: true,
      },
    }),
    prisma.campaignInviteLink.create({
      data: {
        campaignId: vipCampaign.id,
        telegramGroupId: vipGroup.id,
        externalInviteId: 'vip-reengagement',
        inviteUrl: 'https://t.me/+R9s11Pulse',
        label: 'VIP Re-engagement',
        memberLimit: 100,
        createsJoinRequest: true,
      },
    }),
    prisma.campaignInviteLink.create({
      data: {
        campaignId: affiliateCampaign.id,
        telegramGroupId: affiliateGroup.id,
        externalInviteId: 'affiliate-burst-vn',
        inviteUrl: 'https://t.me/+AffBurstVN',
        label: 'Affiliate Burst VN / Direct',
        memberLimit: 300,
        createsJoinRequest: false,
      },
    }),
  ]);

  await prisma.inviteLinkEvent.createMany({
    data: [
      {
        inviteLinkId: inviteLinks[0].id,
        eventType: 'LINK_CREATED',
        groupTitle: globalGroup.title,
        groupExternalId: globalGroup.externalId,
        detail: 'Seed invite link created for Summer Growth 2026.',
      },
      {
        inviteLinkId: inviteLinks[0].id,
        eventType: 'USER_JOINED',
        actorExternalId: '5029112',
        actorUsername: 'juli_dev',
        groupTitle: globalGroup.title,
        groupExternalId: globalGroup.externalId,
        detail: 'Joined through Summer Growth 2026 / Direct.',
      },
      {
        inviteLinkId: inviteLinks[1].id,
        eventType: 'JOIN_REQUEST',
        actorExternalId: '9911002',
        actorUsername: 'support_wallet',
        groupTitle: partnerGroup.title,
        groupExternalId: partnerGroup.externalId,
        detail: 'Join request captured via Partner Referral East / Review.',
      },
      {
        inviteLinkId: inviteLinks[3].id,
        eventType: 'USER_JOINED',
        actorExternalId: '7711004',
        actorUsername: 'aff_vn_lead',
        groupTitle: affiliateGroup.title,
        groupExternalId: affiliateGroup.externalId,
        detail: 'Joined through Affiliate Burst VN / Direct.',
      },
    ],
  });

  const now = Date.now();
  await prisma.communityMember.createMany({
    data: [
      {
        displayName: 'Julianne Doe',
        avatarInitials: 'JD',
        externalId: '5029112',
        username: 'juli_dev',
        campaignLabel: summerCampaign.name,
        campaignId: summerCampaign.id,
        groupTitle: globalGroup.title,
        ownerName: 'Campaign Operator',
        note: 'Nguồn vào nhóm tốt, giữ theo dõi chuyển đổi.',
        joinedAt: new Date(now - 2 * 60 * 1000),
        leftAt: null,
      },
      {
        displayName: 'Mark Kovalski',
        avatarInitials: 'MK',
        externalId: '1129384',
        username: 'marko_k',
        campaignLabel: 'Trực tiếp',
        campaignId: summerCampaign.id,
        groupTitle: globalGroup.title,
        ownerName: 'Nexus Admin',
        note: 'Đã phản hồi bài giới thiệu trong 10 phút đầu.',
        joinedAt: new Date(now - 14 * 60 * 1000),
        leftAt: null,
      },
      {
        displayName: 'Sasha Lee',
        avatarInitials: 'SL',
        externalId: '9928374',
        username: 'slee_crypto',
        campaignLabel: summerCampaign.name,
        campaignId: summerCampaign.id,
        groupTitle: globalGroup.title,
        ownerName: 'Trust Moderator',
        note: 'Đã rời nhóm sau 35 phút, cần xem lại nguồn traffic.',
        joinedAt: new Date(now - 60 * 60 * 1000),
        leftAt: new Date(now - 25 * 60 * 1000),
      },
      {
        displayName: 'Nadia Tran',
        avatarInitials: 'NT',
        externalId: '8872311',
        username: 'nadia_growth',
        campaignLabel: partnerCampaign.name,
        campaignId: partnerCampaign.id,
        groupTitle: partnerGroup.title,
        ownerName: 'Campaign Operator',
        note: 'Lead chất lượng, ưu tiên chăm sóc.',
        joinedAt: new Date(now - 3 * 60 * 60 * 1000),
        leftAt: null,
      },
      {
        displayName: 'Luca Meyer',
        avatarInitials: 'LM',
        externalId: '2219087',
        username: 'luca_ops',
        campaignLabel: 'Trực tiếp',
        campaignId: vipCampaign.id,
        groupTitle: vipGroup.title,
        ownerName: null,
        note: 'Đã rời nhóm, chưa có người phụ trách.',
        joinedAt: new Date(now - 5 * 60 * 60 * 1000),
        leftAt: new Date(now - 90 * 60 * 1000),
      },
      {
        displayName: 'Anh Vu',
        avatarInitials: 'AV',
        externalId: '7711004',
        username: 'aff_vn_lead',
        campaignLabel: affiliateCampaign.name,
        campaignId: affiliateCampaign.id,
        groupTitle: affiliateGroup.title,
        ownerName: 'Nexus Admin',
        note: 'Lead local cho workspace Affiliate.',
        joinedAt: new Date(now - 45 * 60 * 1000),
        leftAt: null,
      },
      {
        displayName: 'Mai Ho',
        avatarInitials: 'MH',
        externalId: '7711005',
        username: 'aff_growth_mai',
        campaignLabel: affiliateCampaign.name,
        campaignId: affiliateCampaign.id,
        groupTitle: affiliateGroup.title,
        ownerName: 'Campaign Operator',
        note: 'Khach Affiliate moi vao nhom trong ngay.',
        joinedAt: new Date(now - 95 * 60 * 1000),
        leftAt: null,
      },
    ],
  });

  await prisma.metricCard.createMany({
    data: [
      { label: 'Join mới trong ngày', value: '12,482', trend: '+18.4%', tone: EventTone.PRIMARY },
      { label: 'Invite link đang chạy', value: '156', trend: '85% healthy', tone: EventTone.SUCCESS },
      { label: 'Autopost đã gửi', value: '45,102', trend: '24 lịch active', tone: EventTone.WARNING },
      { label: 'Spam đã chặn', value: '3,209', trend: 'Mức cảnh báo cao', tone: EventTone.DANGER },
    ],
  });

  await prisma.eventFeedItem.createMany({
    data: [
      {
        timeLabel: '23:14',
        title: 'Worker đã xử lý user_joined',
        detail: '31 thành viên mới được map đúng campaign Summer Growth 2026.',
        tone: EventTone.SUCCESS,
      },
      {
        timeLabel: '22:58',
        title: 'manual_review_required',
        detail: '3 tài khoản mới chứa link rút gọn và risk score vượt ngưỡng 72.',
        tone: EventTone.DANGER,
      },
      {
        timeLabel: '22:42',
        title: 'autopost_failed',
        detail: '1 job Telegram bị giới hạn tốc độ, đang retry lần 2.',
        tone: EventTone.WARNING,
      },
      {
        timeLabel: '22:30',
        title: 'campaign_metric_updated',
        detail: 'Campaign Partner Referral East tăng thêm 112 joins trong 40 phút.',
        tone: EventTone.PRIMARY,
      },
    ],
  });

  await prisma.spamEvent.createMany({
    data: [
      {
        source: 'telegram.mock',
        eventType: 'message_received',
        actorUsername: 'crypto_bonus_admin',
        actorExternalId: '9911001',
        groupTitle: 'Nexus Global',
        groupExternalId: globalGroup.externalId,
        campaignLabel: 'Summer Growth 2026',
        messageText: 'Claim now: free USDT bonus at https://bit.ly/fake-airdrop',
        messageExternalId: '21001',
        matchedRules: ['contains_link', 'keyword:free usdt', 'domain:bit.ly'],
        ruleScore: 92,
        aiScore: 88,
        finalScore: 91,
        aiLabel: 'spam',
        aiReason: 'Message combines shortener, bonus bait and scam vocabulary.',
        decision: 'BAN',
      },
      {
        source: 'telegram.mock',
        eventType: 'join_request',
        actorUsername: 'support_wallet',
        actorExternalId: '9911002',
        groupTitle: 'Partner Circle',
        groupExternalId: partnerGroup.externalId,
        campaignLabel: 'Partner Referral East',
        messageText: null,
        matchedRules: ['join_request_requires_review', 'suspicious_username'],
        ruleScore: 38,
        aiScore: 47,
        finalScore: 41,
        aiLabel: 'suspicious',
        aiReason: 'Username resembles social-engineering support handle.',
        decision: 'REVIEW',
        manualDecision: 'WARN',
        manualNote: 'Theo dõi thêm trước khi restrict.',
        reviewedAt: new Date(now - 10 * 60 * 1000),
      },
      {
        source: 'telegram.mock',
        eventType: 'message_received',
        actorUsername: 'aff_vn_lead',
        actorExternalId: '7711004',
        groupTitle: affiliateGroup.title,
        groupExternalId: affiliateGroup.externalId,
        campaignLabel: affiliateCampaign.name,
        messageText: 'Daily affiliate check-in and campaign progress.',
        messageExternalId: '32001',
        matchedRules: [],
        ruleScore: 0,
        aiScore: 3,
        finalScore: 1,
        aiLabel: 'safe',
        aiReason: 'Normal group discussion message.',
        decision: 'ALLOW',
      },
    ],
  });

  await prisma.systemLog.createMany({
    data: [
      {
        level: 'INFO',
        scope: 'system.bootstrap',
        action: 'seed',
        message: 'Local seed completed',
        detail: 'Database da duoc seed cho local Docker runtime.',
      },
      {
        level: 'WARN',
        scope: 'telegram.invite',
        action: 'create_invite_link',
        message: 'Invite link test requires a real Telegram group',
        detail:
          'Bot can duoc them vao group that va co quyen admin de create invite link thanh cong.',
      },
    ],
  });

  await prisma.moderationRule.createMany({
    data: [
      {
        sortOrder: 1,
        content: 'Chặn link ngoài danh sách whitelist và domain blacklist.',
      },
      {
        sortOrder: 2,
        content: 'Mute user mới trong 24 giờ đầu nếu spam quá số lượng message cho phép.',
      },
      {
        sortOrder: 3,
        content: 'Tính risk score từ keyword, link, history và AI moderation.',
      },
      {
        sortOrder: 4,
        content: 'Đẩy event vào moderation room thay vì xử lý nặng ngay trong webhook.',
      },
    ],
  });

  const phases = [
    {
      name: 'Phase 0-2',
      outcome: 'Chuẩn hóa tài liệu, repo và schema nền tảng.',
      sortOrder: 1,
      tasks: [
        'Chuẩn hóa UTF-8 cho toàn bộ tài liệu tiếng Việt.',
        'Chốt workspace apps/web, apps/api, packages và docs.',
        'Thiết kế schema cho users, campaigns, invite links, spam, autopost và analytics.',
      ],
    },
    {
      name: 'Phase 3-5',
      outcome: 'Dựng frontend shell, auth RBAC và Telegram core integration.',
      sortOrder: 2,
      tasks: [
        'Xây admin shell theo Digital Command design system.',
        'Thêm login, role, permission guard và navigation theo quyền.',
        'Thêm bot token config, Telegram service wrapper và webhook receiver.',
      ],
    },
    {
      name: 'Phase 6-9',
      outcome: 'Ship campaign, tracking, dashboard và autopost.',
      sortOrder: 3,
      tasks: [
        'Tạo campaign CRUD và invite link generation.',
        'Map user join qua queue và worker để cập nhật metrics.',
        'Xây dashboard analytics và autopost scheduling với log gửi bài.',
      ],
    },
    {
      name: 'Phase 10-13',
      outcome: 'Hoàn thiện moderation, realtime, AI và hardening.',
      sortOrder: 4,
      tasks: [
        'Thêm anti-spam rule engine, blocked users và moderation panel.',
        'Emit WebSocket events cho dashboard, moderation và autopost.',
        'Mở rộng AI moderation, security hardening và production readiness.',
      ],
    },
  ];

  for (const phase of phases) {
    const created = await prisma.roadmapPhase.create({
      data: {
        name: phase.name,
        outcome: phase.outcome,
        sortOrder: phase.sortOrder,
      },
    });

    await prisma.roadmapTask.createMany({
      data: phase.tasks.map((task, index) => ({
        content: task,
        sortOrder: index + 1,
        roadmapPhaseId: created.id,
      })),
    });
  }

  await prisma.autopostCapability.createMany({
    data: [
      {
        title: 'Template',
        detail: 'Thông báo bản phát hành, cảnh báo hệ thống, nội dung campaign.',
      },
      {
        title: 'Schedule',
        detail: 'Một lần, định kỳ, theo slot hoặc theo workflow campaign.',
      },
      {
        title: 'Target',
        detail: 'Telegram groups, channels và kiến trúc sẵn sàng cho multi-platform.',
      },
      {
        title: 'Logs',
        detail: 'Sent, failed, retried và thời gian phản hồi từng kênh.',
      },
    ],
  });

  const autopostTargets = await Promise.all([
    prisma.autopostTarget.create({
      data: {
        platform: 'TELEGRAM',
        externalId: globalGroup.externalId,
        displayName: 'Thông báo Toàn cầu',
        status: 'CONNECTED',
      },
    }),
    prisma.autopostTarget.create({
      data: {
        platform: 'DISCORD',
        externalId: 'discord-dev-logs',
        displayName: 'Discord Dev Logs',
        status: 'CONNECTED',
      },
    }),
    prisma.autopostTarget.create({
      data: {
        platform: 'TELEGRAM',
        externalId: alphaGroup.externalId,
        displayName: 'Nhóm Người dùng Thử nghiệm',
        status: 'ERROR',
      },
    }),
  ]);

  const autopostSchedules = await Promise.all([
    prisma.autopostSchedule.create({
      data: {
        title: 'Bản phát hành v2.4',
        message:
          'Bản phát hành v2.4 đã sẵn sàng. Vui lòng xem changelog và xác nhận rollout.',
        frequency: 'IMMEDIATE',
        scheduledFor: new Date(now + 15 * 60 * 1000),
        status: 'SCHEDULED',
        targetId: autopostTargets[0].id,
      },
    }),
    prisma.autopostSchedule.create({
      data: {
        title: 'Daily Ops Digest',
        message:
          'Tóm tắt daily ops: campaign growth, spam score và trạng thái worker.',
        frequency: 'DAILY',
        scheduledFor: new Date(now + 2 * 60 * 60 * 1000),
        status: 'SCHEDULED',
        targetId: autopostTargets[1].id,
      },
    }),
  ]);

  await prisma.autopostLog.createMany({
    data: [
      {
        scheduleId: autopostSchedules[0].id,
        status: 'SENT',
        detail: 'Telegram target seeded as sent for local preview.',
        externalPostId: 'seed-tele-1',
      },
      {
        scheduleId: autopostSchedules[1].id,
        status: 'FAILED',
        detail: 'Discord webhook placeholder failed in seed preview.',
        externalPostId: null,
      },
    ],
  });

  const superAdminRole = await prisma.role.create({
    data: {
      name: 'Quản trị hệ thống',
      description: 'Toàn quyền tenant, workspace, bot và cấu hình toàn hệ thống.',
    },
  });
  const adminRole = await prisma.role.create({
    data: {
      name: 'Quản trị workspace',
      description: 'Toàn quyền cấu hình bot, policy, queue và analytics.',
    },
  });
  const moderatorRole = await prisma.role.create({
    data: {
      name: 'Kiểm duyệt viên',
      description: 'Review spam, mute, ban và xử lý manual review.',
    },
  });
  const operatorRole = await prisma.role.create({
    data: {
      name: 'Vận hành',
      description: 'Quản lý campaign, autopost và theo dõi tăng trưởng.',
    },
  });
  const viewerRole = await prisma.role.create({
    data: {
      name: 'Cộng tác viên',
      description: 'Read-only view of assigned campaigns and customers.',
    },
  });

  const permissions = await Promise.all([
    prisma.permission.create({
      data: { code: 'organization.manage', description: 'Manage organizations and tenant-level configuration' },
    }),
    prisma.permission.create({
      data: { code: 'workspace.manage', description: 'Manage workspaces, memberships and bot assignments' },
    }),
    prisma.permission.create({
      data: { code: 'campaign.view', description: 'View assigned campaigns and member progress' },
    }),
    prisma.permission.create({
      data: { code: 'campaign.manage', description: 'Manage campaigns and invite links' },
    }),
    prisma.permission.create({
      data: { code: 'moderation.review', description: 'Review spam and moderation alerts' },
    }),
    prisma.permission.create({
      data: { code: 'settings.manage', description: 'Manage bot settings and security config' },
    }),
    prisma.permission.create({
      data: { code: 'autopost.execute', description: 'Manage autopost schedules and logs' },
    }),
  ]);

  await prisma.rolePermission.createMany({
    data: [
      ...permissions.map((permission) => ({
        roleId: superAdminRole.id,
        permissionId: permission.id,
      })),
      ...permissions
        .filter((permission) => permission.code !== 'organization.manage')
        .map((permission) => ({
        roleId: adminRole.id,
        permissionId: permission.id,
      })),
      {
        roleId: moderatorRole.id,
        permissionId: permissions[4].id,
      },
      {
        roleId: viewerRole.id,
        permissionId: permissions[2].id,
      },
      {
        roleId: operatorRole.id,
        permissionId: permissions[3].id,
      },
      {
        roleId: operatorRole.id,
        permissionId: permissions[4].id,
      },
      {
        roleId: operatorRole.id,
        permissionId: permissions[5].id,
      },
      {
        roleId: operatorRole.id,
        permissionId: permissions[6].id,
      },
    ],
  });

  const superAdminPasswordHash = await bcrypt.hash('superadmin123', 10);
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  const operatorPasswordHash = await bcrypt.hash('operator123', 10);
  const viewerPasswordHash = await bcrypt.hash('viewer123', 10);

  const [superAdminUser, adminUser, operatorUser, viewerUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: 'superadmin@nexus.local',
        username: 'system_superadmin',
        name: 'Quản trị hệ thống',
        department: 'Nen tang',
        status: UserStatus.ACTIVE,
        passwordHash: superAdminPasswordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: 'admin@nexus.local',
        username: 'nexus_admin',
        name: 'Quản trị workspace',
        department: 'Hạ tầng',
        status: UserStatus.ACTIVE,
        passwordHash: adminPasswordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: 'operator@nexus.local',
        username: 'campaign_operator',
        name: 'Vận hành',
        department: 'Tăng trưởng',
        status: UserStatus.ACTIVE,
        passwordHash: operatorPasswordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: 'viewer@nexus.local',
        username: 'campaign_viewer',
        name: 'Cộng tác viên',
        department: 'Quan sÃ¡t',
        status: UserStatus.ACTIVE,
        passwordHash: viewerPasswordHash,
      },
    }),
  ]);

  const moderatorPasswordHash = await bcrypt.hash('moderator123', 10);
  const analystPasswordHash = await bcrypt.hash('analyst123', 10);

  const [moderatorUser, analystUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: 'moderator@nexus.local',
        username: 'mod_guard',
        name: 'Kiểm duyệt viên',
        department: 'Cộng đồng',
        status: UserStatus.ACTIVE,
        passwordHash: moderatorPasswordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: 'analyst@nexus.local',
        username: 'growth_analyst',
        name: 'Growth Analyst',
        department: 'Phân tích',
        status: UserStatus.AWAY,
        passwordHash: analystPasswordHash,
      },
    }),
  ]);

  await prisma.userRole.createMany({
    data: [
      {
        userId: superAdminUser.id,
        roleId: superAdminRole.id,
      },
      {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
      {
        userId: operatorUser.id,
        roleId: operatorRole.id,
      },
      {
        userId: viewerUser.id,
        roleId: viewerRole.id,
      },
      {
        userId: moderatorUser.id,
        roleId: moderatorRole.id,
      },
      {
        userId: analystUser.id,
        roleId: operatorRole.id,
      },
    ],
  });

  await prisma.workspaceMembership.createMany({
    data: [
      {
        userId: superAdminUser.id,
        roleId: superAdminRole.id,
        workspaceId: defaultWorkspace.id,
      },
      {
        userId: superAdminUser.id,
        roleId: superAdminRole.id,
        workspaceId: affiliateWorkspace.id,
      },
      {
        userId: adminUser.id,
        roleId: adminRole.id,
        workspaceId: defaultWorkspace.id,
      },
      {
        userId: operatorUser.id,
        roleId: operatorRole.id,
        workspaceId: defaultWorkspace.id,
      },
      {
        userId: viewerUser.id,
        roleId: viewerRole.id,
        workspaceId: defaultWorkspace.id,
      },
      {
        userId: moderatorUser.id,
        roleId: moderatorRole.id,
        workspaceId: defaultWorkspace.id,
      },
      {
        userId: analystUser.id,
        roleId: operatorRole.id,
        workspaceId: defaultWorkspace.id,
      },
    ],
  });

  await prisma.systemSetting.createMany({
    data: [
      { key: 'system.name', value: 'Telegram Operations Platform' },
      { key: 'security.2fa', value: 'required-for-admins' },
      { key: 'websocket.strategy', value: 'socket-io-with-room-auth' },
      { key: 'ui.language', value: 'vi' },
      { key: 'notifications.spam_alerts', value: 'true' },
      { key: 'notifications.campaign_reports', value: 'true' },
      { key: 'notifications.unknown_ip', value: 'true' },
      { key: 'notifications.system_critical', value: 'true' },
      {
        key: 'security.ip_whitelist',
        value: '192.168.1.1|Văn phòng chính\n42.115.32.11|Home Network',
      },
      { key: 'ai.base_url', value: 'https://v98store.com/v1' },
      { key: 'ai.api_token', value: '' },
      { key: 'ai.model', value: 'nexus-guard-mini' },
      {
        key: 'ai.prompt',
        value:
          'Bạn là AI moderation assistant cho nền tảng Telegram operations. Ưu tiên an toàn, trả nhãn ngắn gọn và nêu lý do rõ ràng.',
      },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
