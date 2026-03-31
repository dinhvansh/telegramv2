const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  await prisma.rolePermission.count();

  await prisma.autopostLog.deleteMany();
  await prisma.autopostSchedule.deleteMany();
  await prisma.autopostTarget.deleteMany();

  await prisma.inviteLinkEvent.deleteMany();
  await prisma.campaignInviteLink.deleteMany();
  await prisma.communityMember.deleteMany();
  await prisma.campaign.deleteMany();

  await prisma.telegramGroupModerationSettings.deleteMany();
  await prisma.telegramBotConfig.deleteMany();
  await prisma.telegramGroup.deleteMany();

  await prisma.moderationDomain.deleteMany();
  await prisma.moderationKeyword.deleteMany();
  await prisma.moderationPolicy.deleteMany();
  await prisma.moderationRule.deleteMany();
  await prisma.spamEvent.deleteMany();
  await prisma.moderationActionJob.deleteMany();

  await prisma.eventFeedItem.deleteMany();
  await prisma.metricCard.deleteMany();
  await prisma.roadmapTask.deleteMany();
  await prisma.roadmapPhase.deleteMany();
  await prisma.autopostCapability.deleteMany();
  await prisma.systemLog.deleteMany();

  console.log(
    'Operational sample data cleared. Users, roles, permissions, and system settings were preserved.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
