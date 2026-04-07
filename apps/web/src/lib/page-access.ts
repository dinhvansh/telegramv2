export type DashboardPage =
  | "dashboard"
  | "campaigns"
  | "members"
  | "member360"
  | "moderation"
  | "autopost"
  | "roles"
  | "telegram"
  | "settings"
  | "workspaces";

export const pagePermissionMap: Record<DashboardPage, string[]> = {
  dashboard: [],
  campaigns: ["campaign.manage", "campaign.view"],
  members: ["campaign.manage", "campaign.view", "moderation.review"],
  member360: ["campaign.manage", "campaign.view", "moderation.review"],
  moderation: ["moderation.review", "settings.manage"],
  autopost: ["autopost.execute"],
  roles: ["settings.manage"],
  telegram: ["settings.manage"],
  settings: ["settings.manage"],
  workspaces: ["organization.manage"],
};

export function canAccessPage(
  permissions: string[] | undefined,
  page: DashboardPage,
) {
  const userPermissions = permissions ?? [];
  const requiredPermissions = pagePermissionMap[page] ?? [];

  return (
    requiredPermissions.length === 0 ||
    requiredPermissions.some((permission) => userPermissions.includes(permission))
  );
}
