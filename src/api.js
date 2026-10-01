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

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
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

  if (options.responseType === 'blob') {
    return await response.blob();
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

export async function createInvitation(email, role, organizationId) {
  const body = { email };
  if (typeof role === 'number' || !isNaN(Number(role))) {
    body.roleId = Number(role);
  } else if (role) {
    body.role = role;
  }
  if (organizationId) {
    body.organizationId = Number(organizationId);
  }
  return request("/v1/auth/accounts/invitations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function inviteCustomerUser(customerId, { email, role }) {
  return request(`/v1/customers/${customerId}/invitations`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export async function getCustomerRoles() {
  return request("/v1/customers/roles");
}

export async function getCustomerInvitations(customerId, status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request(`/v1/customers/${customerId}/invitations${query}`);
}

export async function getInvitations(status, organizationId) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (organizationId) params.set("organizationId", organizationId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return request(`/v1/auth/accounts/invitations${qs}`);
}

export async function validateInvitation(token) {
  const cleanToken = (token || "").trim();
  return request(`/v1/auth/accounts/invitations/${encodeURIComponent(cleanToken)}`);
}

export async function acceptInvitation(token, data) {
  const cleanToken = (token || data?.token || "").trim();
  return request(`/v1/auth/accounts/invitations/${encodeURIComponent(cleanToken)}/accept`, {
    method: "POST",
    body: JSON.stringify({ ...data, token: cleanToken }),
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

export async function forgotPassword(email) {
  return request("/v1/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: (email || "").trim().toLowerCase() }),
  });
}

export async function resendResetOtp(email) {
  return request("/v1/auth/resend-reset-otp", {
    method: "POST",
    body: JSON.stringify({ email: (email || "").trim().toLowerCase() }),
  });
}

export async function verifyResetOtp(email, otp) {
  return request("/v1/auth/verify-reset-otp", {
    method: "POST",
    body: JSON.stringify({
      email: (email || "").trim().toLowerCase(),
      otp: String(otp || "").trim(),
    }),
  });
}

export async function resetPassword({ resetToken, newPassword, confirmPassword }) {
  return request("/v1/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({
      resetToken,
      newPassword,
      confirmPassword,
    }),
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

export async function getOrganization(organizationId) {
  const path = organizationId ? `/v1/organizations/${organizationId}` : "/v1/organizations/me";
  return request(path);
}

export async function updateOrganization(payload, organizationId) {
  const path = organizationId ? `/v1/organizations/${organizationId}` : "/v1/organizations/me";
  return request(path, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updateOrganizationStatus(status, reason, organizationId) {
  const path = organizationId ? `/v1/organizations/${organizationId}/status` : "/v1/organizations/me/status";
  return request(path, {
    method: "PATCH",
    body: JSON.stringify({ status, reason }),
  });
}

export async function getOrganizationAuditLog({ page = 1, limit = 20, organizationId } = {}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) }).toString();
  const path = organizationId ? `/v1/organizations/${organizationId}/audit-log?${qs}` : `/v1/organizations/me/audit-log?${qs}`;
  return request(path);
}

export async function getComplianceStatus(organizationId) {
  return request(`/v1/organizations/${organizationId}/compliance-status`);
}

export async function getComplianceDocuments(organizationId) {
  return request(`/v1/organizations/${organizationId}/compliance-documents`);
}

export async function uploadComplianceDocument(organizationId, formDataOrPayload) {
  const isFormData = typeof FormData !== "undefined" && formDataOrPayload instanceof FormData;
  return request(`/v1/organizations/${organizationId}/compliance-documents`, {
    method: "POST",
    body: isFormData ? formDataOrPayload : JSON.stringify(formDataOrPayload),
  });
}

export async function downloadComplianceDocument(organizationId, docId) {
  return request(`/v1/organizations/${organizationId}/compliance-documents/${docId}/download`, {
    responseType: "blob",
  });
}

export async function updateComplianceDocument(organizationId, docId, payload) {
  return request(`/v1/organizations/${organizationId}/compliance-documents/${docId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteComplianceDocument(organizationId, docId) {
  return request(`/v1/organizations/${organizationId}/compliance-documents/${docId}`, {
    method: "DELETE",
  });
}

export async function verifyCarrier(organizationId, payload = {}) {
  const options = { method: "POST" };
  if (payload && Object.keys(payload).length > 0) {
    options.body = JSON.stringify(payload);
  }
  return request(`/v1/organizations/${organizationId}/verify-carrier`, options);
}

export async function getOrganizationSsoConfig(organizationId) {
  const path = organizationId ? `/v1/organizations/${organizationId}/sso` : "/v1/organizations/me/sso";
  return request(path);
}

export async function updateOrganizationSsoConfig(payload, organizationId) {
  const path = organizationId ? `/v1/organizations/${organizationId}/sso` : "/v1/organizations/me/sso";
  return request(path, {
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


/* ─── Customer Master ───────────────────────────────────────── */

/**
 * GET /v1/customers
 * Accepts a URLSearchParams-compatible query string:
 *   page, limit, search, status
 */
export async function getCustomers(queryString) {
  const qs = queryString ? `?${queryString}` : '';
  return request(`/v1/customers${qs}`);
}

/**
 * GET /v1/customers/:id
 */
export async function getCustomer(id) {
  return request(`/v1/customers/${id}`);
}

/**
 * POST /v1/customers
 * Payload: { legal_name, tax_id?, is_enterprise? }
 */
export async function createCustomer(payload) {
  return request('/v1/customers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * PUT /v1/customers/:id
 * Payload: { legal_name?, tax_id?, is_enterprise?, operating_status? }
 */
export async function updateCustomer(id, payload) {
  return request(`/v1/customers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/**
 * PATCH /v1/customers/:id/status
 * Payload: { status: 'active' | 'suspended' | 'terminated' }
 */
export async function updateCustomerStatus(id, status) {
  return request(`/v1/customers/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/**
 * DELETE /v1/customers/:id
 * Soft-deactivation (sets status → terminated on the backend).
 */
export async function deactivateCustomer(id) {
  return request(`/v1/customers/${id}`, {
    method: 'DELETE',
  });
}

/**
 * GET /v1/customers/:id/audit-log
 * Accepts optional query params: page, limit
 * Returns { success, data: [...], pagination: {...} }
 */
export async function getCustomerAuditLog(id, { page = 1, limit = 20 } = {}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) }).toString();
  return request(`/v1/customers/${id}/audit-log?${qs}`);
}

/* ─── Vendor Master ─────────────────────────────────────────── */

/**
 * GET /v1/vendors
 * Supports query parameters: page, limit, search, status
 */
export async function getVendors(queryString) {
  const qs = queryString ? `?${queryString}` : '';
  return request(`/v1/vendors${qs}`);
}

/**
 * GET /v1/vendors/:id
 */
export async function getVendor(id) {
  return request(`/v1/vendors/${id}`);
}

/**
 * POST /v1/vendors
 * Payload: { legal_name, tax_id?, mc_number?, dot_number?, operating_status?,
 *            safety_rating?, status?, is_enterprise?, address_line1?, address_line2?,
 *            city?, state?, country?, postal_code?, company_phone?, company_email?, website? }
 */
export async function createVendor(payload) {
  return request('/v1/vendors', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * PUT /v1/vendors/:id
 * Payload: fields to update
 */
export async function updateVendor(id, payload) {
  return request(`/v1/vendors/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/**
 * PATCH /v1/vendors/:id/status
 * Payload: { status: 'pending' | 'active' | 'suspended' | 'terminated', reason?: string }
 */
export async function updateVendorStatus(id, status, reason) {
  return request(`/v1/vendors/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason }),
  });
}

/**
 * DELETE /v1/vendors/:id
 * Soft deactivation (status → 'terminated')
 */
export async function deleteVendor(id) {
  return request(`/v1/vendors/${id}`, {
    method: 'DELETE',
  });
}

/**
 * GET /v1/vendors/:id/compliance
 * Returns carrier regulatory details & compliance documents
 */
export async function getVendorCompliance(id) {
  return request(`/v1/vendors/${id}/compliance`);
}

/**
 * GET /v1/vendors/:id/audit-log
 * Query params: page, limit
 */
export async function getVendorAuditLog(id, { page = 1, limit = 20 } = {}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) }).toString();
  return request(`/v1/vendors/${id}/audit-log?${qs}`);
}

/**
 * GET /v1/branches
 * Query params: page, limit, search, status
 */
export async function getBranches(queryString = '') {
  const qs = queryString ? (queryString.startsWith('?') ? queryString : `?${queryString}`) : '';
  return request(`/v1/branches${qs}`);
}

/**
 * GET /v1/branches/:id
 */
export async function getBranch(id) {
  return request(`/v1/branches/${id}`);
}

/**
 * POST /v1/branches
 * Payload: { branch_code, name, is_headquarters?, status?, address_line1?, address_line2?,
 *            city?, state?, country?, postal_code?, phone?, email?, manager_user_id? }
 */
export async function createBranch(payload) {
  return request('/v1/branches', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * PUT /v1/branches/:id
 * Payload: fields to update
 */
export async function updateBranch(id, payload) {
  return request(`/v1/branches/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/**
 * PATCH /v1/branches/:id/status
 * Payload: { status: 'active' | 'inactive', reason?: string }
 */
export async function updateBranchStatus(id, status, reason) {
  return request(`/v1/branches/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason }),
  });
}

/**
 * DELETE /v1/branches/:id
 * Soft deactivation (status → 'inactive')
 */
export async function deleteBranch(id, reason) {
  return request(`/v1/branches/${id}`, {
    method: 'DELETE',
    body: reason ? JSON.stringify({ reason }) : undefined,
  });
}

/**
 * GET /v1/branches/:id/audit-log
 * Query params: page, limit
 */
export async function getBranchAuditLog(id, { page = 1, limit = 20 } = {}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) }).toString();
  return request(`/v1/branches/${id}/audit-log?${qs}`);
}

export const isApiConfigured = Boolean(API_BASE);

