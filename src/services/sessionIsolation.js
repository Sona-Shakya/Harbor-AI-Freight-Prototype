export function createGetCacheKey(identity, method, path) {
  return `${identity || 'anonymous'}:${method}:${path}`;
}

export function stripPersistedUserContext(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return {};
  const { profile, activeOrgRoleIndex, ...workspaceState } = state;
  return workspaceState;
}

export function clearPersistedWorkspaceState(storage, key) {
  storage.removeItem(key);
}

export const ACTIVE_ORG_ROLE_STORAGE_KEY = 'harbor-active-org-role';

export function getActiveOrgRoleIdentity(profile, orgRole) {
  const userId = profile?.user?.id ?? profile?.id;
  const orgId = orgRole?.org_id ?? orgRole?.organization_id ?? orgRole?.orgId ?? orgRole?.organization?.id;
  const roleId = orgRole?.role_id ?? orgRole?.roleId ?? orgRole?.role?.id;
  if (userId == null || orgId == null || roleId == null) return null;
  return { userId: String(userId), orgId: String(orgId), roleId: String(roleId) };
}

export function findActiveOrgRoleIndex(profile, selection) {
  const userId = profile?.user?.id ?? profile?.id;
  if (userId == null || !selection || String(userId) !== String(selection.userId)) return -1;
  return (profile.organization_roles || []).findIndex((orgRole) => {
    const identity = getActiveOrgRoleIdentity(profile, orgRole);
    return identity?.orgId === String(selection.orgId) && identity?.roleId === String(selection.roleId);
  });
}

export function readActiveOrgRoleSelection(storage, key = ACTIVE_ORG_ROLE_STORAGE_KEY) {
  const serialized = storage.getItem(key);
  if (!serialized) return null;
  try {
    const selection = JSON.parse(serialized);
    if (
      selection &&
      selection.userId != null &&
      selection.orgId != null &&
      selection.roleId != null
    ) {
      return {
        userId: String(selection.userId),
        orgId: String(selection.orgId),
        roleId: String(selection.roleId),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveActiveOrgRoleSelection(storage, profile, orgRole, key = ACTIVE_ORG_ROLE_STORAGE_KEY) {
  const selection = getActiveOrgRoleIdentity(profile, orgRole);
  if (!selection) return false;
  storage.setItem(key, JSON.stringify(selection));
  return true;
}

export function clearActiveOrgRoleSelection(storage, key = ACTIVE_ORG_ROLE_STORAGE_KEY) {
  storage.removeItem(key);
}
