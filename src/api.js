const API_BASE = (
  typeof window !== "undefined"
    ? ""
    : (
       (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
       (typeof process !== "undefined" && process.env?.VITE_API_BASE_URL) ||
       ""
      )
).replace(/\/$/, "");
import * as authService from './services/authService.js';
const AUTH_EXPIRED_EVENT = 'harbor-auth-expired';
const GET_CACHE_TTL = 30_000;
const inFlightGets = new Map();
const getCache = new Map();

export function clearGetCache() {
  getCache.clear();
  inFlightGets.clear();
}

authService.subscribe(clearGetCache);

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const token = authService.getToken() || 'anonymous';
  const cacheKey = `${token}:${method}:${path}`;
  if (method === 'GET' && !options.skipCache && options.responseType !== 'blob') {
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
    if (options.includeHeaders) {
      return {
        blob: await response.blob(),
        contentDisposition: response.headers.get('content-disposition'),
        contentType: response.headers.get('content-type'),
      };
    }
    return await response.blob();
  }

  const value = response.status === 204 ? null : await response.json();
  if (method === 'GET' && !options.skipCache) getCache.set(cacheKey, {value, expiresAt: Date.now() + GET_CACHE_TTL});
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
  return request("/v1/auth/profile", { skipCache: true });
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

  if (Array.isArray(payload?.data?.values)) {
    return payload.data.values;
  }
  return list(payload);
}

export function logout() {
  authService.logout();
}

export async function load(organizationId = null) {
  let configMap = {};
  if (organizationId) {
    try {
      const configRes = await getConfig(organizationId);
      configMap = configRes?.data?.config || {};
    } catch {
      // Continue gracefully if config facade is unreachable
    }
  }

  const rawCategories = list(
    await request("/v1/admin/settings/categories")
  );

  const categories = await Promise.all(
    rawCategories.map(async (category) => {
      const catId = categoryId(category);
      const valuesPayload = await request(
        `/v1/admin/settings/categories/${catId}/values`
      );

      const rawValues = Array.isArray(valuesPayload?.data)
        ? valuesPayload.data
        : list(valuesPayload);

      const values = rawValues.map((value) => ({
        id: value.id,
        category_id: value.category_id ?? catId,
        value: value.value,
        label: value.label,
        sortOrder: value.sort_order ?? value.sortOrder ?? 0,
        sort_order: value.sort_order ?? value.sortOrder ?? 0,
        isActive: value.is_active ?? value.isActive ?? true,
        is_active: value.is_active ?? value.isActive ?? true,
        isDefault: value.is_default ?? value.isDefault ?? false,
        is_default: value.is_default ?? value.isDefault ?? false,
        isSystemDefined:
          value.is_system_defined ??
          value.isSystemDefined ??
          false,
        is_system_defined:
          value.is_system_defined ??
          value.isSystemDefined ??
          false,
      }));

      const catConf = configMap[category.key];
      const overrides = Array.isArray(catConf?.overrides)
        ? catConf.overrides
        : organizationId
        ? await loadOrganizationSettings(category.key, organizationId)
        : [];

      return {
        id: catId,
        category_id: catId,
        module: category.module,
        key: category.key,
        name: category.name,
        description: category.description || "",
        isSystemDefined:
          category.is_system_defined ??
          category.isSystemDefined ??
          false,
        is_system_defined:
          category.is_system_defined ??
          category.isSystemDefined ??
          false,
        values,
        overrides,
      };
    })
  );

  return categories;
}

export const getSettingCategories = () =>
  request("/v1/admin/settings/categories");

export const getSettingCategoryValues = (categoryId) =>
  request(`/v1/admin/settings/categories/${categoryId}/values`);

export const updateValue = (id, patch) =>
  request(`/v1/admin/settings/values/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(patch.label !== undefined && { label: patch.label }),
      ...(patch.sortOrder !== undefined && { sort_order: patch.sortOrder }),
      ...(patch.sort_order !== undefined && { sort_order: patch.sort_order }),
      ...(patch.isActive !== undefined && { is_active: patch.isActive }),
      ...(patch.is_active !== undefined && { is_active: patch.is_active }),
      ...(patch.isDefault !== undefined && { is_default: patch.isDefault }),
      ...(patch.is_default !== undefined && { is_default: patch.is_default }),
    }),
  });

export const deactivateValue = (id) =>
  request(`/v1/admin/settings/values/${id}`, {
    method: "DELETE",
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
      sort_order: value.sort_order ?? value.sortOrder ?? 0,
      is_active: value.is_active ?? value.isActive ?? true,
      is_default: value.is_default ?? value.isDefault ?? false,
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

export const getSettingAuditLog = () =>
  request("/v1/admin/settings/audit-log");

export const getConfig = (organizationId = null) => {
  const qs = organizationId ? `?org_id=${organizationId}` : '';
  return request(`/v1/admin/config${qs}`);
};

export const updateConfig = (payload) =>
  request('/v1/admin/config', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const getSettingsByCategory = (categoryKey, organizationId = null) => {
  const qs = organizationId ? `?org_id=${organizationId}` : '';
  return request(`/v1/settings/${categoryKey}${qs}`);
};

export async function exportSettings(format = 'json') {
  return request(`/v1/admin/settings/export?format=${encodeURIComponent(format)}`, {
    responseType: 'blob',
    includeHeaders: true,
    skipCache: true,
  });
}

export const exportSettingsJSON = () => exportSettings('json');
export const exportSettingsCSV = () => exportSettings('csv');

export async function importSettings(formDataOrPayload) {
  const isFormData = typeof FormData !== 'undefined' && formDataOrPayload instanceof FormData;
  return request('/v1/admin/settings/import', {
    method: 'POST',
    body: isFormData ? formDataOrPayload : JSON.stringify(formDataOrPayload),
  });
}


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

/**
 * GET /v1/agents
 * Query params: page, limit, search, status
 */
export async function getAgents(queryString = '') {
  const qs = queryString ? (queryString.startsWith('?') ? queryString : `?${queryString}`) : '';
  return request(`/v1/agents${qs}`);
}

/**
 * GET /v1/agents/:id
 */
export async function getAgent(id) {
  return request(`/v1/agents/${id}`);
}

/**
 * POST /v1/agents
 * Payload: { legal_name, tax_id?, mc_number?, dot_number?, operating_status?, safety_rating?,
 *            status?, is_enterprise?, address_line1?, address_line2?, city?, state?,
 *            country?, postal_code?, company_phone?, company_email?, website? }
 */
export async function createAgent(payload) {
  return request('/v1/agents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * PUT /v1/agents/:id
 * Payload: fields to update
 */
export async function updateAgent(id, payload) {
  return request(`/v1/agents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/**
 * PATCH /v1/agents/:id/status
 * Payload: { status: 'pending' | 'active' | 'suspended' | 'terminated', reason?: string }
 */
export async function updateAgentStatus(id, status, reason) {
  return request(`/v1/agents/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason }),
  });
}

/**
 * DELETE /v1/agents/:id
 * Soft deactivation (status → 'terminated')
 */
export async function deleteAgent(id, reason) {
  return request(`/v1/agents/${id}`, {
    method: 'DELETE',
    body: reason ? JSON.stringify({ reason }) : undefined,
  });
}

/**
 * GET /v1/agents/:id/audit-log
 * Query params: page, limit
 */
export async function getAgentAuditLog(id, { page = 1, limit = 20 } = {}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) }).toString();
  return request(`/v1/agents/${id}/audit-log?${qs}`);
}

/**
 * GET /v1/ports
 * Query params: page, limit, search, country, port_type, status, sort_by, sort_order
 */
export async function getPorts(queryString = '') {
  const qs = queryString ? (queryString.startsWith('?') ? queryString : `?${queryString}`) : '';
  return request(`/v1/ports${qs}`);
}

/**
 * GET /v1/ports/:id
 */
export async function getPort(id) {
  return request(`/v1/ports/${id}`);
}

/**
 * POST /v1/ports
 * Payload: { port_code, name, port_type?, country, state?, city?, lat?, lng?, status?, timezone?, reason? }
 */
export async function createPort(payload) {
  return request('/v1/ports', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * PUT /v1/ports/:id
 * Payload: fields to update
 */
export async function updatePort(id, payload) {
  return request(`/v1/ports/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/**
 * PATCH /v1/ports/:id/status
 * Payload: { status: 'active' | 'inactive', reason?: string }
 */
export async function updatePortStatus(id, status, reason) {
  return request(`/v1/ports/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason }),
  });
}

/**
 * DELETE /v1/ports/:id
 * Soft deactivation (status → 'inactive')
 */
export async function deletePort(id, reason) {
  return request(`/v1/ports/${id}`, {
    method: 'DELETE',
    body: reason ? JSON.stringify({ reason }) : undefined,
  });
}

/**
 * GET /v1/ports/:id/audit
 * Query params: page, limit
 */
export async function getPortAuditLog(id, { page = 1, limit = 20 } = {}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) }).toString();
  return request(`/v1/ports/${id}/audit?${qs}`);
}

/* ─── CFS Master (Container Freight Stations) ─────────────────── */

/**
 * GET /v1/cfs
 * Query params: page, limit, search, cfs_code, name, country, city, state, facility_type, firms_code, port_id, status, sort_by, sort_order
 */
export async function getCfsStations(queryString = '') {
  const qs = queryString ? (queryString.startsWith('?') ? queryString : `?${queryString}`) : '';
  return request(`/v1/cfs${qs}`);
}
export const getCfsList = getCfsStations;
export const getCfs = getCfsStations;

/**
 * GET /v1/cfs/:id
 */
export async function getCfsStation(id) {
  return request(`/v1/cfs/${id}`);
}
export const getCfsById = getCfsStation;

/**
 * POST /v1/cfs
 * Payload: { cfs_code, name, firms_code?, facility_type?, port_id?, address_line1?, address_line2?, city?, state?, country, postal_code?, lat?, lng?, phone?, email?, operating_hours?, status?, reason? }
 */
export async function createCfsStation(payload) {
  return request('/v1/cfs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export const createCfs = createCfsStation;

/**
 * PUT /v1/cfs/:id
 * Payload: fields to update
 */
export async function updateCfsStation(id, payload) {
  return request(`/v1/cfs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
export const updateCfs = updateCfsStation;

/**
 * PATCH /v1/cfs/:id/status
 * Payload: { status: 'active' | 'inactive', reason?: string }
 */
export async function updateCfsStatus(id, status, reason) {
  return request(`/v1/cfs/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason }),
  });
}

/**
 * DELETE /v1/cfs/:id
 * Soft deactivation (status → 'inactive')
 */
export async function deleteCfsStation(id, reason) {
  return request(`/v1/cfs/${id}`, {
    method: 'DELETE',
    body: reason ? JSON.stringify({ reason }) : undefined,
  });
}
export const deleteCfs = deleteCfsStation;

/**
 * GET /v1/cfs/:id/audit or /v1/cfs/:id/audit-log
 * Query params: page, limit
 */
export async function getCfsAuditLog(id, { page = 1, limit = 20 } = {}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) }).toString();
  return request(`/v1/cfs/${id}/audit?${qs}`);
}

export const isApiConfigured = Boolean(API_BASE || typeof window !== 'undefined');

// ==========================================
// FR-1.10 MULTI-ORGANIZATION CONTEXT SWITCHING
// ==========================================
export async function getUserOrganizations() {
  return request("/v1/auth/organizations");
}

export async function switchOrganizationContext(organizationId) {
  const response = await request("/v1/auth/switch-organization", {
    method: "POST",
    body: JSON.stringify({ organizationId, organization_id: organizationId }),
  });
  const token = response?.token || response?.data?.token;
  if (token) {
    authService.setToken(token);
  }
  return response;
}

// ==========================================
// FR-1.6 CARRIER RE-VERIFICATION
// ==========================================
export async function reverifyCarrier(organizationId) {
  return request(`/v1/organizations/${organizationId}/reverify`, {
    method: "POST",
  });
}

// ==========================================
// FR-1.7 DRIVER ONBOARDING & MANAGEMENT
// ==========================================
export async function getDrivers(queryString = "") {
  const q = queryString ? `?${queryString}` : "";
  return request(`/v1/drivers${q}`);
}

export async function getDriver(id) {
  return request(`/v1/drivers/${id}`);
}

export async function createDriver(data) {
  return request("/v1/drivers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateDriverProfile(id, data) {
  return request(`/v1/drivers/${id}/profile`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function recordDriverDocument(id, formDataOrPayload) {
  const isFormData = typeof FormData !== "undefined" && formDataOrPayload instanceof FormData;
  return request(`/v1/drivers/${id}/documents`, {
    method: "POST",
    body: isFormData ? formDataOrPayload : JSON.stringify(formDataOrPayload),
  });
}

export async function updateDriverDocument(id, docId, data) {
  return request(`/v1/drivers/${id}/documents/${docId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function updateDriverBackgroundCheck(id, { status, notes }) {
  return request(`/v1/drivers/${id}/background-check`, {
    method: "PATCH",
    body: JSON.stringify({ status, notes }),
  });
}

export async function updateDriverOnboardingStatus(id, { status, notes }) {
  return request(`/v1/drivers/${id}/onboarding-status`, {
    method: "PATCH",
    body: JSON.stringify({ status, notes }),
  });
}

export async function approveDriverOnboarding(id, { notes } = {}) {
  return request(`/v1/drivers/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  });
}

// ==========================================
// MODULE M3: LOAD BOARD & FREIGHT MATCHING
// ==========================================

export async function getLoadPostings(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/load-board${q}`);
}

export async function getLoadPosting(id) {
  return request(`/v1/load-board/${id}`);
}

export async function createLoadPosting(data) {
  return request("/v1/load-board", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function cancelLoadPosting(id, data = {}) {
  return request(`/v1/load-board/${id}/cancel`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteLoadPosting(id) {
  return request(`/v1/load-board/${id}`, {
    method: "DELETE",
  });
}

export async function bookNowLoad(id) {
  return request(`/v1/load-board/${id}/book`, {
    method: "POST",
  });
}

export async function submitLoadBid(id, data) {
  return request(`/v1/load-board/${id}/bid`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getLoadBids(id) {
  return request(`/v1/load-board/${id}/bids`);
}

export async function counterLoadBid(loadId, bidId, data) {
  return request(`/v1/load-board/${loadId}/bids/${bidId}/counter`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function acceptLoadBid(loadId, bidId) {
  return request(`/v1/load-board/${loadId}/bids/${bidId}/accept`, {
    method: "PATCH",
  });
}

export async function rejectLoadBid(loadId, bidId, data = {}) {
  return request(`/v1/load-board/${loadId}/bids/${bidId}/reject`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function withdrawLoadBid(loadId, bidId) {
  return request(`/v1/load-board/${loadId}/bids/${bidId}/withdraw`, {
    method: "PATCH",
  });
}

export async function getLoadMatches(id) {
  return request(`/v1/load-board/${id}/matches`);
}

export async function getCarrierPreferences() {
  return request("/v1/load-board/preferences");
}

export async function saveCarrierPreference(data) {
  return request("/v1/load-board/preferences", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getLaneMetrics(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/load-board/metrics/lanes${q}`);
}

export async function getShipments(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/shipments${q}`);
}

export async function getShipment(id) {
  return request(`/v1/shipments/${id}`);
}

export async function createShipment(data) {
  return request("/v1/shipments", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateShipment(id, data) {
  return request(`/v1/shipments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function updateShipmentStatus(id, data) {
  return request(`/v1/shipments/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function cancelShipment(id, data = {}) {
  return request(`/v1/shipments/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function bookShipment(id, data = {}) {
  return request(`/v1/shipments/${id}/book`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function addShipmentStop(id, stopData) {
  return request(`/v1/shipments/${id}/stops`, {
    method: "POST",
    body: JSON.stringify(stopData),
  });
}

// ============================================================================
// MODULE M4: QUOTING & RATE MANAGEMENT APIS
// ============================================================================

export async function getQuotes(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/quotes${q}`);
}

export async function getQuote(id) {
  return request(`/v1/quotes/${id}`);
}

export async function createQuote(data) {
  return request("/v1/quotes", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function bookQuote(id) {
  return request(`/v1/quotes/${id}/book`, {
    method: "POST",
  });
}

export async function getQuoteComparison(shipmentId) {
  return request(`/v1/quotes/comparison?shipment_id=${encodeURIComponent(shipmentId)}`);
}

export async function getRateAgreements(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/rate-agreements${q}`);
}

export async function getRateAgreement(id) {
  return request(`/v1/rate-agreements/${id}`);
}

export async function createRateAgreement(data) {
  return request("/v1/rate-agreements", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateRateAgreement(id, data) {
  return request(`/v1/rate-agreements/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteRateAgreement(id) {
  return request(`/v1/rate-agreements/${id}`, {
    method: "DELETE",
  });
}

export async function getLaneRateHistory(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/rates/lane-history${q}`);
}

export async function generateRateConfirmation(shipmentId, data = {}) {
  return request(`/v1/shipments/${shipmentId}/rate-confirmation`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getShipmentRateConfirmation(shipmentId) {
  return request(`/v1/shipments/${shipmentId}/rate-confirmation`);
}

export async function getRateConfirmation(id) {
  return request(`/v1/rate-confirmations/${id}`);
}

export async function signRateConfirmation(id, data) {
  return request(`/v1/rate-confirmations/${id}/sign`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function downloadRateConfirmationDocument(id) {
  return request(`/v1/rate-confirmations/${id}/document`, {
    responseType: "blob",
  });
}

// ============================================================
// M5: FLEET & CARRIER MANAGEMENT APIS
// ============================================================

// Fleet Assets (FR-5.1)
export async function getVehicles(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/fleet/vehicles${q}`);
}

export async function getVehicle(id) {
  return request(`/v1/fleet/vehicles/${id}`);
}

export async function getAssignedVehicle() {
  return request(`/v1/fleet/vehicles/assigned`);
}

export async function createVehicle(data) {
  return request("/v1/fleet/vehicles", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateVehicle(id, data) {
  return request(`/v1/fleet/vehicles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteVehicle(id) {
  return request(`/v1/fleet/vehicles/${id}`, {
    method: "DELETE",
  });
}

// Vehicle Maintenance & Availability (FR-5.2)
export async function getVehicleAvailability(vehicleId) {
  return request(`/v1/fleet/vehicles/${vehicleId}/availability`);
}

export async function getVehicleMaintenance(vehicleId, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/fleet/vehicles/${vehicleId}/maintenance${q}`);
}

export async function createVehicleMaintenance(vehicleId, data) {
  return request(`/v1/fleet/vehicles/${vehicleId}/maintenance`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getMaintenanceRecord(id) {
  return request(`/v1/fleet/maintenance/${id}`);
}

export async function updateMaintenanceRecord(id, data) {
  return request(`/v1/fleet/maintenance/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function getVehicleInspections(vehicleId, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/fleet/vehicles/${vehicleId}/inspections${q}`);
}

export async function createVehicleInspection(vehicleId, data) {
  return request(`/v1/fleet/vehicles/${vehicleId}/inspections`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getInspectionRecord(id) {
  return request(`/v1/fleet/inspections/${id}`);
}

export async function updateInspectionRecord(id, data) {
  return request(`/v1/fleet/inspections/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// Driver Roster & HOS (FR-5.3 & FR-5.8)
export async function getFleetDrivers(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/fleet/drivers${q}`);
}

export async function getCarrierDrivers(carrierId, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/carriers/${carrierId}/drivers${q}`);
}

export async function getFleetDriver(id) {
  return request(`/v1/fleet/drivers/${id}`);
}

export async function updateFleetDriver(id, data) {
  return request(`/v1/fleet/drivers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function getDriverHos(driverId) {
  return request(`/v1/drivers/${driverId}/hos`);
}

export async function getDriverHosHistory(driverId, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/drivers/${driverId}/hos/history${q}`);
}

export async function recordDutyStatus(driverId, data) {
  return request(`/v1/drivers/${driverId}/hos/logs`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function checkHosEligibility(driverId, data) {
  return request(`/v1/drivers/${driverId}/hos/eligibility`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getDriverEld(driverId) {
  return request(`/v1/drivers/${driverId}/eld`);
}

export async function syncDriverEld(driverId) {
  return request(`/v1/drivers/${driverId}/eld/sync`, {
    method: "POST",
  });
}

export async function getEldProviders() {
  return request(`/v1/fleet/eld/providers`);
}

// Carrier Compliance, Insurance & Suspension (FR-5.4)
export async function getCarrierCompliance(carrierOrgId = null) {
  const path = carrierOrgId ? `/v1/carriers/${carrierOrgId}/compliance` : `/v1/fleet/compliance`;
  return request(path);
}

export async function updateCarrierCompliance(carrierOrgId, data) {
  const path = carrierOrgId ? `/v1/carriers/${carrierOrgId}/compliance` : `/v1/fleet/compliance`;
  return request(path, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function setCarrierSuspension(carrierOrgId, data) {
  const path = carrierOrgId ? `/v1/carriers/${carrierOrgId}/suspension` : `/v1/fleet/suspension`;
  return request(path, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getCarrierInsurance(carrierOrgId = null, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  const path = carrierOrgId ? `/v1/carriers/${carrierOrgId}/insurance${q}` : `/v1/fleet/insurance${q}`;
  return request(path);
}

export async function getInsurancePolicy(id) {
  return request(`/v1/fleet/insurance/${id}`);
}

export async function createInsurancePolicy(data, carrierOrgId = null) {
  const path = carrierOrgId ? `/v1/carriers/${carrierOrgId}/insurance` : `/v1/fleet/insurance`;
  return request(path, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateInsurancePolicy(id, data) {
  return request(`/v1/fleet/insurance/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function getComplianceExpirations(carrierOrgId = null, thresholdDays = 30) {
  const path = carrierOrgId
    ? `/v1/carriers/${carrierOrgId}/compliance/expirations?threshold_days=${thresholdDays}`
    : `/v1/fleet/compliance/expirations?threshold_days=${thresholdDays}`;
  return request(path);
}

// Fleet Assignment (FR-5.7)
export async function assignFleetToShipment(shipmentId, data) {
  return request(`/v1/shipments/${shipmentId}/assign-fleet`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getShipmentFleetAssignment(shipmentId) {
  return request(`/v1/shipments/${shipmentId}/assign-fleet`);
}

export async function removeShipmentFleetAssignment(shipmentId) {
  return request(`/v1/shipments/${shipmentId}/assign-fleet`, {
    method: "DELETE",
  });
}

// Carrier Scorecard & Performance (FR-5.5)
export async function getCarrierScorecard(carrierOrgId = null, period = 'rolling_90d') {
  const query = new URLSearchParams();
  if (period) query.set('period', period);
  if (carrierOrgId) query.set('carrier_org_id', carrierOrgId);
  const q = query.toString() ? `?${query.toString()}` : '';
  const path = carrierOrgId ? `/v1/fleet/scorecards/${carrierOrgId}${q}` : `/v1/fleet/scorecards${q}`;
  return request(path);
}

export async function evaluateCarrierScorecard(carrierOrgId = null, period = 'rolling_90d') {
  const path = carrierOrgId ? `/v1/fleet/scorecards/${carrierOrgId}/evaluate` : `/v1/fleet/scorecards/evaluate`;
  return request(path, {
    method: 'POST',
    body: JSON.stringify({ carrier_org_id: carrierOrgId, period }),
  });
}

// Carrier Network Tiers (FR-5.6)
export async function getCarrierTier(carrierOrgId = null, shipperOrgId = null) {
  const query = new URLSearchParams();
  if (carrierOrgId) query.set('carrier_org_id', carrierOrgId);
  if (shipperOrgId) query.set('shipper_org_id', shipperOrgId);
  const q = query.toString() ? `?${query.toString()}` : '';
  const path = carrierOrgId ? `/v1/fleet/tiers/${carrierOrgId}${q}` : `/v1/fleet/tiers${q}`;
  return request(path);
}

export async function listCarrierTiers(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : '';
  return request(`/v1/fleet/tiers/list${q}`);
}

export async function updateCarrierTier(carrierOrgId = null, data = {}) {
  const targetId = carrierOrgId || data?.carrier_org_id || data?.carrier_id;
  const path = targetId ? `/v1/fleet/tiers/${targetId}` : `/v1/fleet/tiers`;
  const bodyPayload = targetId && !data.carrier_org_id ? { ...data, carrier_org_id: targetId } : data;
  return request(path, {
    method: 'PATCH',
    body: JSON.stringify(bodyPayload),
  });
}

// =====================================================================
// FMS Module M6: Dispatch & Execution API Methods
// =====================================================================

/**
 * FR-6.1: Retrieve the operational Dispatch Board
 * @param {Object} params - Query params (date, status, driver_id, carrier_id, view_mode)
 */
export async function getDispatchBoard(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/dispatch/board${q}`, { skipCache: true });
}

/**
 * FR-6.2 & FR-6.3: Assign driver & equipment to a booked shipment and execute dispatch
 * @param {Object} data - { shipment_id, driver_id, truck_id, trailer_id, special_instructions, notes }
 */
export async function assignDispatch(data) {
  return request("/v1/dispatch/assign", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * FR-6.4: Driver accept or reject load assignment
 * @param {Object} data - { shipment_id, response ('accepted'|'rejected'), rejection_reason, notes }
 */
export async function driverResponseDispatch(data) {
  return request("/v1/dispatch/driver-response", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * FR-6.7: Mid-execution re-dispatch / re-assignment workflow
 * @param {Object} data - { shipment_id, new_driver_id, new_truck_id, new_trailer_id, reason, notes }
 */
export async function reassignDispatch(data) {
  return request("/v1/dispatch/reassign", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Stop Milestone: Record arrival at a stop
 * @param {number|string} shipmentId
 * @param {number|string} stopId
 * @param {Object} data - { actual_time, odometer, notes }
 */
export async function recordStopArrival(shipmentId, stopId, data = {}) {
  return request(`/v1/shipments/${shipmentId}/stops/${stopId}/arrive`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Stop Milestone: Record departure from a stop
 * @param {number|string} shipmentId
 * @param {number|string} stopId
 * @param {Object} data - { actual_time, odometer, notes }
 */
export async function recordStopDeparture(shipmentId, stopId, data = {}) {
  return request(`/v1/shipments/${shipmentId}/stops/${stopId}/depart`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Stop Milestone: Update milestone directly
 * @param {number|string} shipmentId
 * @param {number|string} stopId
 * @param {Object} data - { action: 'arrive'|'depart', actual_time, odometer, notes }
 */
export async function updateStopMilestone(shipmentId, stopId, data = {}) {
  return request(`/v1/shipments/${shipmentId}/stops/${stopId}/milestone`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * FR-6.6: Log a check-call for a shipment
 * @param {number|string} shipmentId
 * @param {Object} data - { location, city, state, lat, lng, odometer, eta, status, note, call_type }
 */
export async function logCheckCall(shipmentId, data) {
  return request(`/v1/shipments/${shipmentId}/check-calls`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * FR-6.6: Retrieve check-calls history for a shipment
 * @param {number|string} shipmentId
 */
export async function getCheckCalls(shipmentId) {
  return request(`/v1/shipments/${shipmentId}/check-calls`, { skipCache: true });
}

/**
 * FR-6.5: Manually log an exception on a shipment
 * @param {number|string} shipmentId
 * @param {Object} data - { type, severity, description }
 */
export async function createShipmentException(shipmentId, data) {
  return request(`/v1/shipments/${shipmentId}/exceptions`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * FR-6.5: Get exceptions for a specific shipment
 * @param {number|string} shipmentId
 * @param {Object} params - { status: 'open'|'resolved'|'all' }
 */
export async function getShipmentExceptions(shipmentId, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/shipments/${shipmentId}/exceptions${q}`, { skipCache: true });
}

/**
 * FR-6.5: Get fleet-wide dispatch exceptions
 * @param {Object} params - { status, severity, type, carrier_id }
 */
export async function getDispatchExceptions(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/dispatch/exceptions${q}`, { skipCache: true });
}

/**
 * FR-6.5: Resolve an active exception
 * @param {number|string} exceptionId
 * @param {Object} data - { resolution_notes }
 * @param {number|string} [shipmentId]
 */
export async function resolveDispatchException(exceptionId, data = {}, shipmentId = null) {
  const path = shipmentId
    ? `/v1/shipments/${shipmentId}/exceptions/${exceptionId}/resolve`
    : `/v1/dispatch/exceptions/${exceptionId}/resolve`;
  return request(path, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// =========================================================================
// MODULE M12: CUSTOMER (SHIPPER) PORTAL APIs (FR-12.1 - FR-12.8)
// =========================================================================

/**
 * FR-12.2: List shipments for customer portal
 * @param {Object} params - { status, search, page, limit, region, shipper_org_id }
 */
export async function getPortalShipments(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") query.set(k, v);
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/portal/shipments${q}`, { skipCache: true });
}

/**
 * FR-12.2: Get shipment details in customer portal
 * @param {number|string} shipmentId
 * @param {Object} [params] - { shipper_org_id }
 */
export async function getPortalShipment(shipmentId, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") query.set(k, v);
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/portal/shipments/${shipmentId}${q}`, { skipCache: true });
}

/**
 * FR-12.3: Live tracking data for customer portal
 * @param {number|string} shipmentId
 * @param {Object} [params] - { shipper_org_id }
 */
export async function getPortalShipmentTracking(shipmentId, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") query.set(k, v);
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/portal/shipments/${shipmentId}/tracking${q}`, { skipCache: true });
}

/**
 * FR-12.1: Multi-step guided quote and book flow
 * @param {Object} data - { action: 'quote'|'book', origin, destination, distance_miles, freight_details, carrier_org_id, quote_amount }
 * @param {Object} [params] - { shipper_org_id }
 */
export async function portalQuoteAndBook(data, params = {}) {
  const query = new URLSearchParams();
  if (params.shipper_org_id) query.set('shipper_org_id', params.shipper_org_id);
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/portal/quote-and-book${q}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * FR-12.4: List shipment documents in portal
 * @param {number|string} shipmentId
 * @param {Object} [params] - { shipper_org_id }
 */
export async function getPortalShipmentDocuments(shipmentId, params = {}) {
  const query = new URLSearchParams();
  if (params.shipper_org_id) query.set('shipper_org_id', params.shipper_org_id);
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/portal/shipments/${shipmentId}/documents${q}`, { skipCache: true });
}

/**
 * FR-12.4: Download shipment document authorization
 * @param {number|string} shipmentId
 * @param {number|string} docId
 * @param {Object} [params] - { shipper_org_id }
 */
export async function downloadPortalShipmentDocument(shipmentId, docId, params = {}) {
  const query = new URLSearchParams();
  if (params.shipper_org_id) query.set('shipper_org_id', params.shipper_org_id);
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/portal/shipments/${shipmentId}/documents/${docId}/download${q}`, { skipCache: true });
}

/**
 * FR-12.4: Upload shipment document
 * @param {number|string} shipmentId
 * @param {Object|FormData} data
 * @param {Object} [params] - { shipper_org_id }
 */
export async function uploadPortalShipmentDocument(shipmentId, data, params = {}) {
  const query = new URLSearchParams();
  if (params.shipper_org_id) query.set('shipper_org_id', params.shipper_org_id);
  const q = query.toString() ? `?${query.toString()}` : "";
  const isFormData = typeof FormData !== "undefined" && data instanceof FormData;
  return request(`/v1/portal/shipments/${shipmentId}/documents${q}`, {
    method: "POST",
    body: isFormData ? data : JSON.stringify(data),
  });
}

/**
 * FR-12.5: List billing invoices for shipper
 * @param {Object} params - { status, shipment_id, shipper_org_id }
 */
export async function getPortalInvoices(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") query.set(k, v);
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/portal/invoices${q}`, { skipCache: true });
}

/**
 * FR-12.5: Get invoice details
 * @param {number|string} invoiceId
 * @param {Object} [params] - { shipper_org_id }
 */
export async function getPortalInvoice(invoiceId, params = {}) {
  const query = new URLSearchParams();
  if (params.shipper_org_id) query.set('shipper_org_id', params.shipper_org_id);
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/portal/invoices/${invoiceId}${q}`, { skipCache: true });
}

/**
 * FR-12.6: List saved locations
 * @param {Object} params - { type, search, shipper_org_id }
 */
export async function getPortalSavedLocations(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") query.set(k, v);
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/portal/saved-locations${q}`, { skipCache: true });
}

/**
 * FR-12.6: Create saved location
 * @param {Object} data - { name, type, address, contact }
 * @param {Object} [params] - { shipper_org_id }
 */
export async function createPortalSavedLocation(data, params = {}) {
  const query = new URLSearchParams();
  if (params.shipper_org_id) query.set('shipper_org_id', params.shipper_org_id);
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/portal/saved-locations${q}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * FR-12.6: Update saved location
 * @param {number|string} locationId
 * @param {Object} data - { name, type, address, contact }
 * @param {Object} [params] - { shipper_org_id }
 */
export async function updatePortalSavedLocation(locationId, data, params = {}) {
  const query = new URLSearchParams();
  if (params.shipper_org_id) query.set('shipper_org_id', params.shipper_org_id);
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/portal/saved-locations/${locationId}${q}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * FR-12.6: Delete saved location
 * @param {number|string} locationId
 * @param {Object} [params] - { shipper_org_id }
 */
export async function deletePortalSavedLocation(locationId, params = {}) {
  const query = new URLSearchParams();
  if (params.shipper_org_id) query.set('shipper_org_id', params.shipper_org_id);
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/portal/saved-locations/${locationId}${q}`, {
    method: "DELETE",
  });
}

/**
 * FR-12.6: Get shipper preferences (preferred / blocked carriers)
 * @param {Object} [params] - { shipper_org_id }
 */
export async function getPortalPreferences(params = {}) {
  const query = new URLSearchParams();
  if (params.shipper_org_id) query.set('shipper_org_id', params.shipper_org_id);
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/portal/preferences${q}`, { skipCache: true });
}

/**
 * FR-12.6: Update shipper preferences
 * @param {Object} data - { preferred_carrier_ids, blocked_carrier_ids, notes }
 * @param {Object} [params] - { shipper_org_id }
 */
export async function updatePortalPreferences(data, params = {}) {
  const query = new URLSearchParams();
  if (params.shipper_org_id) query.set('shipper_org_id', params.shipper_org_id);
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/portal/preferences${q}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * FR-12.8: Get shipper analytics (spend by lane, on-time %, carrier performance)
 * @param {Object} params - { shipper_org_id }
 */
export async function getPortalAnalytics(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") query.set(k, v);
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/portal/analytics${q}`, { skipCache: true });
}

/* ==========================================================================
   MODULE M7: ROUTE PLANNING & OPTIMIZATION API CLIENTS (FR-7.1 to FR-7.6)
   ========================================================================== */

/**
 * FR-7.1: Optimize stop sequence for a shipment (TSP-TW)
 * @param {Object} data - { shipment_id, persist: boolean, start_time?: string }
 */
export async function optimizeShipmentRoute(data) {
  return request('/v1/routes/optimize', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * FR-7.2: Get truck-legal directions for a Route
 * @param {string|number} routeId
 * @param {Object} [params] - { simulation: boolean }
 */
export async function getRouteDirections(routeId, params = {}) {
  const query = new URLSearchParams();
  if (params.simulation || params.simulate) query.set('simulation', 'true');
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/routes/${routeId}/directions${q}`, { skipCache: true });
}

/**
 * FR-7.2: Get truck-legal directions for a Shipment (alias)
 * @param {string|number} shipmentId
 * @param {Object} [params] - { simulation: boolean }
 */
export async function getShipmentDirections(shipmentId, params = {}) {
  const query = new URLSearchParams();
  if (params.simulation || params.simulate) query.set('simulation', 'true');
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/shipments/${shipmentId}/directions${q}`, { skipCache: true });
}

/**
 * FR-7.3 & FR-7.6: Get dynamic ETA and telemetry snapshot for a shipment
 * @param {string|number} shipmentId
 */
export async function getShipmentDynamicEta(shipmentId) {
  return request(`/v1/shipments/${shipmentId}/eta`, { skipCache: true });
}

/**
 * FR-7.4 & FR-7.6: Pre-dispatch route simulation (what-if analysis)
 * @param {Object} data - { shipment_id?, stops?, vehicle_id?, driver_id?, departure_time?, mpg?, fuel_price_per_gal?, toll_rate_per_mile? }
 */
export async function simulateRoute(data) {
  return request('/v1/routes/simulate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * FR-7.5: Consolidated multi-load / LTL routing evaluation
 * @param {Object} data - { parent_shipment_id?, shipment_ids?, vehicle_id?, max_payload_lbs?, cargo_volume_cuft? }
 */
export async function consolidateRoutes(data) {
  return request('/v1/routes/consolidate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * FR-7.2: Inspect routing provider status and active capabilities
 */
export async function getRoutingProviderStatus() {
  return request('/v1/routes/provider-status', { skipCache: true });
}

// ============================================================
// JOB MANAGEMENT APIS
// ============================================================

/**
 * List jobs with pagination, status, and search filters
 * @param {Object} params - { page, limit, status, search, start_date, end_date, carrier_id, shipper_id }
 */
export async function getJobs(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      query.set(key, val);
    }
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/jobs${q}`, { skipCache: true });
}

/**
 * Get job details by ID or Job Number
 * @param {string|number} id
 */
export async function getJobById(id) {
  return request(`/v1/jobs/${id}`, { skipCache: true });
}

/**
 * Get job associated with a given Shipment ID
 * @param {string|number} shipmentId
 */
export async function getShipmentJob(shipmentId) {
  return request(`/v1/shipments/${shipmentId}/job`, { skipCache: true });
}

/**
 * Manually create an operational job for a shipment
 * @param {Object} data - { shipment_id, carrier_org_id?, notes?, special_instructions?, description?, status? }
 */
export async function createJob(data) {
  return request('/v1/jobs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Update job lifecycle status
 * @param {string|number} id
 * @param {Object} data - { status, notes? }
 */
export async function updateJobStatus(id, data) {
  return request(`/v1/jobs/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Assign driver & equipment to job and dispatch load
 * @param {string|number} id
 * @param {Object} data - { driver_id, truck_id, trailer_id, notes? }
 */
export async function assignJob(id, data) {
  return request(`/v1/jobs/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

