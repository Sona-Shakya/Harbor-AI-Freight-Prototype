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
import { createGetCacheKey } from './services/sessionIsolation.js';
const AUTH_EXPIRED_EVENT = 'harbor-auth-expired';
const GET_CACHE_TTL = 45_000;
const inFlightGets = new Map();
const getCache = new Map();

export function clearGetCache() {
  getCache.clear();
  inFlightGets.clear();
}

export function invalidateCache(pattern) {
  if (!pattern) {
    clearGetCache();
    return;
  }
  const needle = String(pattern);
  for (const key of getCache.keys()) {
    if (key.includes(needle)) {
      getCache.delete(key);
    }
  }
}

authService.subscribe(clearGetCache);

export function formatQuery(params) {
  if (!params) return '';
  if (typeof params === 'string') {
    return params.startsWith('?') ? params : `?${params}`;
  }
  if (typeof params === 'object') {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, String(val));
      }
    }
    const str = searchParams.toString();
    return str ? `?${str}` : '';
  }
  return '';
}

function attachSignal(promise, signal, onAbort) {
  if (!signal) return promise;
  if (signal.aborted) {
    onAbort?.();
    return Promise.reject(new DOMException('The operation was aborted', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const onSignalAbort = () => {
      signal.removeEventListener('abort', onSignalAbort);
      onAbort?.();
      reject(new DOMException('The operation was aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onSignalAbort, { once: true });
    promise.then(
      (res) => {
        signal.removeEventListener('abort', onSignalAbort);
        resolve(res);
      },
      (err) => {
        signal.removeEventListener('abort', onSignalAbort);
        reject(err);
      }
    );
  });
}

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const token = authService.getToken() || 'anonymous';
  const cacheKey = createGetCacheKey(token, method, path);

  if (method === 'GET' && options.responseType !== 'blob') {
    if (!options.skipCache) {
      const cached = getCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return attachSignal(Promise.resolve(cached.value), options.signal);
      }
    }
    if (inFlightGets.has(cacheKey)) {
      return attachSignal(inFlightGets.get(cacheKey), options.signal, () => {
        inFlightGets.delete(cacheKey);
      });
    }
  }

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
    ...authService.getAuthorizationHeader(),
  };

  const execute = async () => {
    try {
      const fetchOptions = {
        ...options,
        credentials: "include",
        headers,
      };
      delete fetchOptions.skipCache;
      delete fetchOptions.responseType;
      delete fetchOptions.includeHeaders;

      const response = await fetch(`${API_BASE}${path}`, fetchOptions);

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
      if (method === 'GET' && !options.skipCache) {
        getCache.set(cacheKey, { value, expiresAt: Date.now() + GET_CACHE_TTL });
      }
      return value;
    } catch (err) {
      inFlightGets.delete(cacheKey);
      throw err;
    }
  };

  if (method !== 'GET') {
    const value = await execute();
    const cleanPath = path.split('?')[0];
    const segments = cleanPath.split('/').filter(Boolean);
    if (segments.length >= 2) {
      invalidateCache(`/${segments[0]}/${segments[1]}`);
    } else {
      clearGetCache();
    }
    return value;
  }

  const promise = execute()
    .catch((err) => {
      inFlightGets.delete(cacheKey);
      throw err;
    })
    .finally(() => inFlightGets.delete(cacheKey));
  inFlightGets.set(cacheKey, promise);
  return attachSignal(promise, options.signal, () => {
    inFlightGets.delete(cacheKey);
  });
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

export async function registerCompany(payload) {
  return request("/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPublicTracking(trackingReference) {
  const cleanRef = encodeURIComponent(String(trackingReference || '').trim());
  return request(`/v1/track/${cleanRef}`, {
    method: "GET",
    skipCache: true,
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

export async function getProfile(options = {}) {
  // Profile requests should never be aborted on cleanup
  const { signal: _signal, ...rest } = options;
  return request("/v1/auth/profile", {
    ...rest,
    cache: 'no-store',
    skipCache: true,
  });
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
export async function getCustomers(queryString, options = {}) {
  return request(`/v1/customers${formatQuery(queryString)}`, options);
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
export async function getVendors(queryString, options = {}) {
  return request(`/v1/vendors${formatQuery(queryString)}`, options);
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
export async function getBranches(queryString = '', options = {}) {
  return request(`/v1/branches${formatQuery(queryString)}`, options);
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
export async function getAgents(queryString = '', options = {}) {
  return request(`/v1/agents${formatQuery(queryString)}`, options);
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
export async function getPorts(queryString = '', options = {}) {
  return request(`/v1/ports${formatQuery(queryString)}`, options);
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
export async function getCfsStations(queryString = '', options = {}) {
  return request(`/v1/cfs${formatQuery(queryString)}`, options);
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
  clearGetCache();
  const response = await request("/v1/auth/switch-organization", {
    method: "POST",
    body: JSON.stringify({ organizationId, organization_id: organizationId }),
  });
  const token = response?.token || response?.data?.token;
  if (token) {
    authService.setToken(token);
  }
  clearGetCache();
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

export async function getShipments(params = {}, options = {}) {
  return request(`/v1/shipments${formatQuery(params)}`, options);
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

/**
 * FR-3.2: Bulk Shipment Import
 * Sends FormData (file) or JSON payload ({ rows, csv }) to POST /v1/shipments/import
 * Supports .csv, .xlsx, .xls (max 15MB, up to 500 rows)
 * @param {FormData|Object} payloadOrFormData
 */
export async function bulkImportShipments(payloadOrFormData) {
  const isFormData = typeof FormData !== "undefined" && payloadOrFormData instanceof FormData;
  return request("/v1/shipments/import", {
    method: "POST",
    body: isFormData ? payloadOrFormData : JSON.stringify(payloadOrFormData),
  });
}

// ============================================================================
// MODULE M4: QUOTING & RATE MANAGEMENT APIS
// ============================================================================

export async function getQuotes(params = {}, options = {}) {
  return request(`/v1/quotes${formatQuery(params)}`, options);
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
export async function getVehicles(params = {}, options = {}) {
  return request(`/v1/fleet/vehicles${formatQuery(params)}`, options);
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
export async function getFleetDrivers(params = {}, options = {}) {
  return request(`/v1/fleet/drivers${formatQuery(params)}`, options);
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
export async function getDispatchBoard(params = {}, options = {}) {
  return request(`/v1/dispatch/board${formatQuery(params)}`, options);
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
 * FR-11.1 & FR-11.6: List enterprise invoices and accounts receivable.
 * Calls internal endpoint GET /v1/invoices.
 * @param {Object} params - { status, shipment_id, customer_id, page, limit }
 */
export async function getInvoices(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") query.set(k, v);
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/invoices${q}`, { skipCache: true });
}

/**
 * FR-11.1: Get single invoice details by ID.
 * @param {number|string} invoiceId
 */
export async function getInvoice(invoiceId, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") query.set(k, v);
  });
  const q = query.toString() ? `?${query.toString()}` : "";
  return request(`/v1/invoices/${invoiceId}${q}`, { skipCache: true });
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
export async function getJobs(params = {}, options = {}) {
  return request(`/v1/jobs${formatQuery(params)}`, options);
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

// ============================================================================
// MODULE M8: REAL-TIME TRACKING & VISIBILITY (FR-8.1 - FR-8.6)
// ============================================================================

/**
 * FR-8.1: Authorized current GPS location telemetry for a shipment
 * @param {string|number} shipmentId
 */
export async function getShipmentCurrentLocation(shipmentId) {
  return request(`/v1/shipments/${shipmentId}/location`, {
    method: 'GET',
    skipCache: true,
  });
}

/**
 * FR-8.6: Historical location telemetry trail with pagination and time range filters
 * @param {string|number} shipmentId
 * @param {Object} [params] - { page, limit, order, from, to, from_date, to_date }
 */
export async function getShipmentLocationHistory(shipmentId, params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page);
  if (params.limit) query.set('limit', params.limit);
  if (params.order) query.set('order', params.order);
  if (params.from || params.from_date) query.set('from', params.from || params.from_date);
  if (params.to || params.to_date) query.set('to', params.to || params.to_date);
  const qs = query.toString() ? `?${query.toString()}` : '';
  return request(`/v1/shipments/${shipmentId}/location-history${qs}`, {
    method: 'GET',
    skipCache: true,
  });
}

/**
 * FR-8.6: Export historical location data as CSV for claims and billing audits
 * @param {string|number} shipmentId
 * @param {Object} [params] - { from, to, from_date, to_date }
 */
export async function exportShipmentLocationHistory(shipmentId, params = {}) {
  const query = new URLSearchParams();
  if (params.from || params.from_date) query.set('from', params.from || params.from_date);
  if (params.to || params.to_date) query.set('to', params.to || params.to_date);
  const qs = query.toString() ? `?${query.toString()}` : '';
  return request(`/v1/shipments/${shipmentId}/location-history/export${qs}`, {
    method: 'GET',
    responseType: 'blob',
    includeHeaders: true,
    skipCache: true,
  });
}

/**
 * FR-8.2: List active geofence boundaries and recent entry/exit events for a shipment
 * @param {string|number} shipmentId
 */
export async function getShipmentGeofences(shipmentId) {
  return request(`/v1/shipments/${shipmentId}/geofences`, {
    method: 'GET',
    skipCache: true,
  });
}

/**
 * FR-8.2: Create a geofence boundary around shipment origin, destination, stop, or hub
 * @param {string|number} shipmentId
 * @param {Object} data - { stop_id, name, type, center_lat, center_lng, radius_meters, metadata }
 */
export async function createShipmentGeofence(shipmentId, data) {
  return request(`/v1/shipments/${shipmentId}/geofences`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * FR-8.5: List tracking alerts (corridor deviation, stalled shipment) for a shipment
 * @param {string|number} shipmentId
 */
export async function getShipmentTrackingAlerts(shipmentId) {
  return request(`/v1/shipments/${shipmentId}/tracking-alerts`, {
    method: 'GET',
    skipCache: true,
  });
}

/**
 * FR-8.5: Acknowledge or dismiss an active tracking alert
 * @param {string|number} alertId
 * @param {Object} [data] - { status: 'acknowledged' | 'dismissed' }
 */
export async function acknowledgeTrackingAlert(alertId, data = { status: 'acknowledged' }) {
  return request(`/v1/tracking/alerts/${alertId}/acknowledge`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * FR-8.3: Generate shareable public tracking link with configurable expiration (Internal)
 * @param {string|number} shipmentId
 * @param {Object} [data] - { expires_in_hours, expires_in_days }
 */
export async function createTrackingLink(shipmentId, data = {}) {
  return request(`/v1/shipments/${shipmentId}/tracking-link`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * FR-8.3: List active shareable tracking links for a shipment (Internal)
 * @param {string|number} shipmentId
 */
export async function listTrackingLinks(shipmentId) {
  return request(`/v1/shipments/${shipmentId}/tracking-links`, {
    method: 'GET',
    skipCache: true,
  });
}

/**
 * FR-8.3: Revoke an active shareable tracking link (Internal)
 * @param {string|number} shipmentId
 * @param {string|number} linkId
 */
export async function revokeTrackingLink(shipmentId, linkId) {
  return request(`/v1/shipments/${shipmentId}/tracking-link/${linkId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// MODULE M10 — DOCUMENTATION MANAGEMENT API LAYER
// ============================================================================

/**
 * Upload helper with optional progress callback using XMLHttpRequest
 */
async function uploadWithProgressHandler(path, formData, onProgress = null) {
  if (typeof XMLHttpRequest !== 'undefined' && typeof onProgress === 'function') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}${path}`);
      const authHeaders = authService.getAuthorizationHeader();
      for (const [key, val] of Object.entries(authHeaders)) {
        xhr.setRequestHeader(key, val);
      }
      xhr.withCredentials = true;

      if (xhr.upload) {
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable && evt.total > 0) {
            const percent = Math.round((evt.loaded / evt.total) * 100);
            onProgress(percent, evt.loaded, evt.total);
          }
        };
      }

      xhr.onload = () => {
        let parsed = null;
        try {
          parsed = JSON.parse(xhr.responseText);
        } catch {}
        if (xhr.status >= 200 && xhr.status < 300) {
          clearGetCache();
          resolve(parsed);
        } else {
          const message = parsed?.message || parsed?.error || `Upload failed (Status ${xhr.status})`;
          const err = new Error(message);
          err.status = xhr.status;
          err.data = parsed;
          reject(err);
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during file upload'));
      };

      xhr.send(formData);
    });
  }

  // Fallback to standard request()
  return request(path, {
    method: 'POST',
    body: formData,
  });
}

/**
 * 7.1 List Shipment Documents
 * @param {number|string} shipmentId
 * @param {Object} [params] - { type, status, include_archived }
 * @returns {Promise<Array>} Normalized array of document objects
 */
export async function getShipmentDocuments(shipmentId, params = {}) {
  const query = new URLSearchParams();
  if (params.type && params.type !== 'all') query.set('type', params.type);
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.include_archived) query.set('include_archived', 'true');
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await request(`/v1/shipments/${shipmentId}/documents${qs}`, { skipCache: true });
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res)) return res;
  return [];
}

/**
 * 7.2 Upload Shipment Document (multipart/form-data)
 * @param {number|string} shipmentId
 * @param {FormData} formData - fields: file, type, notes
 * @param {Function} [onProgress] - (percent, loaded, total) => void
 * @returns {Promise<Object>}
 */
export async function uploadShipmentDocument(shipmentId, formData, onProgress = null) {
  const res = await uploadWithProgressHandler(`/v1/shipments/${shipmentId}/documents`, formData, onProgress);
  return res?.data || res || {};
}

/**
 * 7.3 Get Document Metadata
 * @param {number|string} documentId
 * @returns {Promise<Object>}
 */
export async function getDocument(documentId) {
  const res = await request(`/v1/documents/${documentId}`);
  return res?.data || res || {};
}

/**
 * 7.4 Download / Stream Document File
 * @param {number|string} documentId
 * @param {boolean} [inline=false] - Preview inline (inline=1) vs attachment
 * @returns {Promise<{ blob: Blob, contentType: string, contentDisposition: string }>}
 */
export async function downloadDocument(documentId, inline = false) {
  const qs = inline ? '?inline=1' : '';
  return request(`/v1/documents/${documentId}/download${qs}`, {
    responseType: 'blob',
    includeHeaders: true,
    skipCache: true,
  });
}

/**
 * 7.5 Get Full Version History
 * @param {number|string} documentId
 * @returns {Promise<Array>} Normalized array of versions
 */
export async function getDocumentVersions(documentId) {
  const res = await request(`/v1/documents/${documentId}/versions`, { skipCache: true });
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res)) return res;
  return [];
}

/**
 * 7.6 Upload New Document Version
 * @param {number|string} documentId
 * @param {FormData} formData - fields: file, notes
 * @param {Function} [onProgress]
 * @returns {Promise<Object>}
 */
export async function uploadDocumentVersion(documentId, formData, onProgress = null) {
  const res = await uploadWithProgressHandler(`/v1/documents/${documentId}/versions`, formData, onProgress);
  return res?.data || res || {};
}

/**
 * 7.7 Soft-Delete (Archive) Document
 * @param {number|string} documentId
 * @param {string} reason - Mandatory archive reason
 * @returns {Promise<Object>}
 */
export async function archiveDocument(documentId, reason) {
  const res = await request(`/v1/documents/${documentId}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });
  return res?.data || res || {};
}

/**
 * 7.8 Generate Bill of Lading (BOL)
 * @param {number|string} shipmentId
 * @param {Object} [data] - Overrides: shipper_name, consignee_name, hazmat_info, etc.
 * @returns {Promise<Object>}
 */
export async function generateBol(shipmentId, data = {}) {
  const res = await request(`/v1/shipments/${shipmentId}/documents/generate-bol`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res?.data || res || {};
}

/**
 * 7.9 Edit Draft BOL
 * @param {number|string} documentId
 * @param {Object} data - Override fields
 * @returns {Promise<Object>}
 */
export async function updateDraftBol(documentId, data = {}) {
  const res = await request(`/v1/documents/${documentId}/bol`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res?.data || res || {};
}

/**
 * 7.10 Finalize Document
 * @param {number|string} documentId
 * @returns {Promise<Object>}
 */
export async function finalizeDocument(documentId) {
  const res = await request(`/v1/documents/${documentId}/finalize`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return res?.data || res || {};
}

/**
 * 7.11 Execute E-Signature
 * @param {number|string} documentId
 * @param {Object} data - { signer_name, signer_role, signature_data }
 * @returns {Promise<Object>}
 */
export async function signDocument(documentId, data) {
  const res = await request(`/v1/documents/${documentId}/sign`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res?.data || res || {};
}

/**
 * 7.12 Document Checklist & Completion
 * @param {number|string} shipmentId
 * @returns {Promise<Object>} Normalized checklist object
 */
export async function getShipmentDocumentChecklist(shipmentId) {
  const res = await request(`/v1/shipments/${shipmentId}/documents/checklist`, { skipCache: true });
  const raw = res?.data || res || {};
  return {
    shipment_id: raw.shipment_id || shipmentId,
    reference_number: raw.reference_number || '',
    is_hazmat: Boolean(raw.is_hazmat),
    is_cross_border: Boolean(raw.is_cross_border),
    required: Array.isArray(raw.required) ? raw.required : [],
    completed: Array.isArray(raw.completed) ? raw.completed : [],
    missing: Array.isArray(raw.missing) ? raw.missing : [],
    percent_complete: typeof raw.percent_complete === 'number' ? raw.percent_complete : 0,
    blocks_invoicing: Boolean(raw.blocks_invoicing),
  };
}

/**
 * 7.13 Create Time-Limited Share Link
 * @param {number|string} documentId
 * @param {Object} [data] - { expires_in_hours: 72 }
 * @returns {Promise<Object>}
 */
export async function createDocumentShareLink(documentId, data = { expires_in_hours: 72 }) {
  const res = await request(`/v1/documents/${documentId}/share-link`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res?.data || res || {};
}

/**
 * 7.14 List Share Links
 * @param {number|string} documentId
 * @returns {Promise<Array>} Normalized array of links
 */
export async function listDocumentShareLinks(documentId) {
  const res = await request(`/v1/documents/${documentId}/share-links`, { skipCache: true });
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res)) return res;
  return [];
}

/**
 * 7.15 Revoke Share Link
 * @param {number|string} linkId
 * @returns {Promise<Object>}
 */
export async function revokeDocumentShareLink(linkId) {
  const res = await request(`/v1/document-share-links/${linkId}`, {
    method: 'DELETE',
  });
  return res?.data || res || {};
}

/**
 * 7.16 Public Stream Shared Document (Unauthenticated)
 * @param {string} token
 * @returns {Promise<{ blob: Blob, contentType: string, contentDisposition: string }>}
 */
export async function getPublicSharedDocument(token) {
  const url = `${API_BASE}/v1/shared-documents/${encodeURIComponent(token)}`;
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'omit', // strictly unauthenticated
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.message) message = errJson.message;
    } catch {}
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  return {
    blob: await response.blob(),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
    contentDisposition: response.headers.get('content-disposition') || '',
  };
}

/**
 * 7.17 Shipment Document Audit Trail
 * @param {number|string} shipmentId
 * @returns {Promise<Array>} Normalized array of audit events
 */
export async function getShipmentDocumentAudit(shipmentId) {
  const res = await request(`/v1/shipments/${shipmentId}/documents/audit`, { skipCache: true });
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res)) return res;
  return [];
}

/**
 * M17 Setting Values: Load active document types directly from backend
 * Queries /v1/documents/types (or /v1/settings/document.type) and normalizes to:
 * [{ key: string, value: string, label: string }]
 * Uses EXACT backend keys (e.g. 'bol', 'pod', 'hazmat_form', etc.)
 * @returns {Promise<Array<{ key: string, value: string, label: string }>>}
 */
export async function getDocumentTypes() {
  try {
    let res = null;
    try {
      res = await request('/v1/documents/types', { skipCache: true });
    } catch {
      res = await getSettingsByCategory('document.type');
    }
    const rawList =
      res?.data?.values ||
      res?.values ||
      (Array.isArray(res?.data) ? res.data : null) ||
      (Array.isArray(res) ? res : null);

    if (Array.isArray(rawList) && rawList.length > 0) {
      return rawList
        .filter((item) => item && (typeof item === 'string' || item.is_active !== false))
        .map((item) => {
          if (typeof item === 'string') {
            return { key: item, value: item, label: item.replace(/_/g, ' ') };
          }
          const val = item.value || item.key || '';
          return {
            key: val,
            value: val,
            label: item.label || item.name || val.replace(/_/g, ' '),
          };
        });
    }
  } catch (err) {
    console.warn('getDocumentTypes error:', err?.message || err);
  }
  return [];
}


