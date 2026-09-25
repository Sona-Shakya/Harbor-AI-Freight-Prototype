const API_BASE = (
  typeof window !== "undefined"
    ? ""
    : (
        (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
        (typeof process !== "undefined" && process.env?.VITE_API_BASE_URL) ||
        "http://localhost:8001"
      )
).replace(/\/$/, "");
import * as authService from './services/authService.js';
const AUTH_EXPIRED_EVENT = 'harbor-auth-expired';
const GET_CACHE_TTL = 30_000;
const inFlightGets = new Map();
const getCache = new Map();

function clearGetCache() {
  getCache.clear();
}

authService.subscribe(clearGetCache);

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const cacheKey = `${method}:${path}`;
  if (method === 'GET') {
    const cached = getCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (inFlightGets.has(cacheKey)) return inFlightGets.get(cacheKey);
  }

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...authService.getAuthorizationHeader(),
  };

  const execute = async () => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });

  if (response.status === 304) {
    const cached = getCache.get(cacheKey);
    if (cached) return cached.value;
  }

  if (!response.ok) {
    const rawMessage = await response.text();
    let message = rawMessage;
    let parsedData = null;
    try {
      parsedData = JSON.parse(rawMessage);
      if (parsedData && (parsedData.message || parsedData.error)) {
        message = parsedData.message || parsedData.error;
      }
    } catch {
      // not JSON
    }

    if (response.status === 401 && authService.hasToken() && !path.includes('/auth/login/verify-otp')) {
      authService.clearToken();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      }
    }

    const error = new Error(message || `API ${response.status}`);
    error.status = response.status;
    error.data = parsedData;
    error.raw = rawMessage;
    throw error;
  }

  const value = response.status === 204 ? null : await response.json();
  if (method === 'GET') getCache.set(cacheKey, {value, expiresAt: Date.now() + GET_CACHE_TTL});
  return value;
  };

  if (method !== 'GET') {
    const value = await execute();
    clearGetCache();
    return value;
  }

  const promise = execute().finally(() => inFlightGets.delete(cacheKey));
  inFlightGets.set(cacheKey, promise);
  return promise;
}

const list = (payload) =>
  Array.isArray(payload)
    ? payload
    : payload?.data ||
      payload?.items ||
      payload?.categories ||
      [];

const categoryId = (category) =>
  category.id || category.category_id;

export async function getAccounts() {
  return request("/v1/auth/accounts");
}

export async function createAccount(data) {
  return request("/v1/auth/accounts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deactivateUser(id) {
  return request(`/v1/auth/accounts/${id}/deactivate`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
}

export async function updateUserStatus(id, status) {
  return request(`/v1/auth/accounts/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function reassignUserRole(id, role) {
  const body = typeof role === 'object' && role !== null ? role : { role };
  return request(`/v1/auth/accounts/${id}/role`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function createInvitation(email, roleId) {
  return request("/v1/auth/accounts/invitations", {
    method: "POST",
    body: JSON.stringify({ email, roleId }),
  });
}

export async function getInvitations(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request(`/v1/auth/accounts/invitations${query}`);
}

export async function validateInvitation(token) {
  return request(`/v1/auth/accounts/invitations/${encodeURIComponent(token)}`);
}

export async function acceptInvitation(token, data) {
  return request(`/v1/auth/accounts/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getRoles() {
  return request("/v1/roles");
}

export async function getRolePermissions(roleId) {
  return request(`/v1/roles/${roleId}/permissions`);
}

export async function updateRolePermissions(roleId, permissionSet) {
  const payload = permissionSet && typeof permissionSet === 'object' && permissionSet.permission_set
    ? permissionSet
    : { permission_set: permissionSet };
  return request(`/v1/roles/${roleId}/permissions`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function login(email, password) {
  const response = await request("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
    }),
  });

  if (response?.otp_required || response?.data?.otp_required) {
    return {
      ...response,
      otpRequired: true,
      otpToken: response?.otp_token || response?.data?.otp_token,
      phone: response?.phone || response?.data?.phone,
    };
  }

  const token = response?.token || response?.data?.token || response?.access_token || response?.data?.access_token;
  if (!token) throw new Error('Sign in failed.');
  authService.setToken(token);
  return response;
}

export async function verifyLoginOtp({ otp_token, otp }) {
  const response = await request("/v1/auth/login/verify-otp", {
    method: "POST",
    body: JSON.stringify({ otp_token, otp }),
  });
  const token = response?.token || response?.data?.token || response?.access_token || response?.data?.access_token;
  if (!token) throw new Error('Login OTP verification failed: Authentication token missing.');
  authService.setToken(token);
  return response;
}

export async function resendLoginOtp({ otp_token }) {
  return request("/v1/auth/login/resend-otp", {
    method: "POST",
    body: JSON.stringify({ otp_token }),
  });
}

export async function getProfile() {
  return request("/v1/auth/profile");
}

export async function getCurrentOrganization() {
  const profile = await getProfile();

  const organizationRole =
    profile?.data?.organization_roles?.[0];

  const organization =
    organizationRole?.organization;

  return {
    organizationId:
      organizationRole?.org_id ??
      organization?.id ??
      null,

    organizationName:
      organization?.legal_name ??
      "",
  };
}

export async function getOrganization() {
  return request("/v1/organizations/me");
}

export async function updateOrganization(payload) {
  return request("/v1/organizations/me", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function verifyCarrier(organizationId, payload = {}) {
  const options = { method: "POST" };
  if (payload && Object.keys(payload).length > 0) {
    options.body = JSON.stringify(payload);
  }
  return request(`/v1/organizations/${organizationId}/verify-carrier`, options);
}

export async function getOrganizationSsoConfig() {
  return request("/v1/organizations/me/sso");
}

export async function updateOrganizationSsoConfig(payload) {
  return request("/v1/organizations/me/sso", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function loadOrganizationSettings(categoryKey, organizationId) {
  if (!categoryKey || !organizationId) {
    return [];
  }

  const payload = await request(
    `/v1/settings/${categoryKey}?org_id=${organizationId}`
  );

  return list(payload);
}

export function logout() {
  authService.logout();
}

export async function load(organizationId = null) {
  const rawCategories = list(
    await request("/v1/admin/settings/categories")
  );

  const categories = await Promise.all(
    rawCategories.map(async (category) => {
      const valuesPayload = await request(
        `/v1/admin/settings/categories/${categoryId(category)}/values`
      );

      const values = list(valuesPayload).map((value) => ({
        id: value.id,
        value: value.value,
        label: value.label,
        sortOrder: value.sort_order ?? value.sortOrder ?? 0,
        isActive: value.is_active ?? value.isActive ?? true,
        isDefault: value.is_default ?? value.isDefault ?? false,
        isSystemDefined:
          value.is_system_defined ??
          value.isSystemDefined ??
          false,
      }));

      return {
        id: categoryId(category),
        module: category.module,
        key: category.key,
        name: category.name,
        description: category.description || "",
        isSystemDefined:
          category.is_system_defined ??
          category.isSystemDefined ??
          false,
        values,
        overrides: organizationId
         ? await loadOrganizationSettings(category.key, organizationId)
         : [],
      };
    })
  );

  return categories;
}

export const updateValue = (id, patch) =>
  request(`/v1/admin/settings/values/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...patch,
      sort_order: patch.sortOrder,
      is_active: patch.isActive,
      is_default: patch.isDefault,
    }),
  });

export const createCategory = (category) =>
  request("/v1/admin/settings/categories", {
    method: "POST",
    body: JSON.stringify({
      module: category.module,
      key: category.key,
      name: category.name,
      description: category.description,
    }),
  });

export const createValue = (categoryId, value) =>
  request(`/v1/admin/settings/categories/${categoryId}/values`, {
    method: "POST",
    body: JSON.stringify({
      value: value.value,
      label: value.label,
      sort_order: value.sortOrder,
      is_active: true,
      is_default: false,
    }),
  });

  export const createOverride = (payload) =>
  request('/v1/admin/settings/overrides', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateOverride = (id, payload) =>
  request(`/v1/admin/settings/overrides/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const loadAudit = () =>
  request("/v1/admin/settings/audit-log");


export const isApiConfigured = Boolean(API_BASE);