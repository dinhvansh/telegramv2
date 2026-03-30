import { TelegramGroupModerationSettings } from "@/components/telegram-group-moderation-settings";

export default async function TelegramGroupModerationPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return <TelegramGroupModerationSettings groupId={groupId} />;
}
