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
  | "workspaces"
  | "contacts";

export const pagePermissionMap: Record<DashboardPage, string[]> = {
  dashboard: [],
  campaigns: ["campaign.manage", "campaign.view"],
  members: ["campaign.manage", "moderation.review", "settings.manage"],
  member360: ["campaign.manage", "moderation.review", "settings.manage"],
  moderation: ["moderation.review", "settings.manage"],
  autopost: ["autopost.execute"],
  roles: ["workspace.manage"],
  telegram: ["settings.manage"],
  settings: ["settings.manage"],
  workspaces: ["organization.manage"],
  contacts: ["contacts.manage", "workspace.manage"],
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
