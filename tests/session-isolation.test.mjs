import test from 'node:test';
import assert from 'node:assert/strict';
import * as authService from '../src/services/authService.js';
import {
  ACTIVE_ORG_ROLE_STORAGE_KEY,
  createGetCacheKey,
  stripPersistedUserContext,
  clearPersistedWorkspaceState,
  findActiveOrgRoleIndex,
  readActiveOrgRoleSelection,
  saveActiveOrgRoleSelection,
  clearActiveOrgRoleSelection,
} from '../src/services/sessionIsolation.js';
import { clearGetCache, getProfile, getUserOrganizations } from '../src/api.js';

test('GET cache keys include the current authentication identity', () => {
  const userACacheKey = createGetCacheKey('user-a-token', 'GET', '/v1/auth/organizations');
  const userBCacheKey = createGetCacheKey('user-b-token', 'GET', '/v1/auth/organizations');

  assert.notEqual(userACacheKey, userBCacheKey);
});

test('logout and a subsequent login clear cached user responses', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ request: fetchCount }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    authService.setToken('same-test-token');
    await getUserOrganizations();
    authService.logout();
    authService.setToken('same-test-token');
    await getUserOrganizations();

    assert.equal(fetchCount, 2);
  } finally {
    authService.logout();
    clearGetCache();
    globalThis.fetch = originalFetch;
  }
});

test('profile requests bypass browser and in-memory GET caches', async () => {
  const originalFetch = globalThis.fetch;
  let fetchOptions;
  globalThis.fetch = async (_url, options) => {
    fetchOptions = options;
    return new Response(JSON.stringify({ user: { id: 'user-b' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    authService.setToken('user-b-token');
    const profile = await getProfile();

    assert.equal(profile.user.id, 'user-b');
    assert.equal(fetchOptions.cache, 'no-store');
  } finally {
    authService.logout();
    clearGetCache();
    globalThis.fetch = originalFetch;
  }
});

test('persisted profile and active organization index are never restored', () => {
  const storedState = {
    profile: { user: { id: 'user-a' } },
    activeOrgRoleIndex: 2,
    records: { shipments: [{ id: 'SHP-A' }] },
  };

  assert.deepEqual(stripPersistedUserContext(storedState), {
    records: { shipments: [{ id: 'SHP-A' }] },
  });
});

test('clearing persisted workspace state removes only the scoped storage entry', () => {
  const values = new Map([
    ['harbor-demo-v1', '{"records":{}}'],
    ['unrelated', 'keep'],
  ]);
  const storage = { removeItem: (key) => values.delete(key) };

  clearPersistedWorkspaceState(storage, 'harbor-demo-v1');

  assert.equal(values.has('harbor-demo-v1'), false);
  assert.equal(values.get('unrelated'), 'keep');
});

const profileWithOrgRoles = {
  user: { id: 17 },
  organization_roles: [
    { org_id: 3, role_id: 8, role: { id: 8, name: 'Dispatcher' } },
    { organization: { id: 4 }, role: { id: 9, name: 'Admin' } },
  ],
};

test('restores a saved organization and role for the matching user', () => {
  assert.equal(findActiveOrgRoleIndex(profileWithOrgRoles, {
    userId: '17',
    orgId: '4',
    roleId: '9',
  }), 1);
});

test('ignores a saved organization and role for a different user', () => {
  assert.equal(findActiveOrgRoleIndex(profileWithOrgRoles, {
    userId: '18',
    orgId: '4',
    roleId: '9',
  }), -1);
});

test('ignores a saved organization or role that no longer exists', () => {
  assert.equal(findActiveOrgRoleIndex(profileWithOrgRoles, {
    userId: '17',
    orgId: '4',
    roleId: '10',
  }), -1);
});

test('saving the selection uses only the tab session storage', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };

  assert.equal(saveActiveOrgRoleSelection(storage, profileWithOrgRoles, profileWithOrgRoles.organization_roles[1]), true);
  assert.deepEqual(readActiveOrgRoleSelection(storage), {
    userId: '17',
    orgId: '4',
    roleId: '9',
  });
});

test('selection cleanup removes the stored org-role on logout and login', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };

  saveActiveOrgRoleSelection(storage, profileWithOrgRoles, profileWithOrgRoles.organization_roles[1]);
  clearActiveOrgRoleSelection(storage);
  assert.equal(storage.getItem(ACTIVE_ORG_ROLE_STORAGE_KEY), null);
  saveActiveOrgRoleSelection(storage, profileWithOrgRoles, profileWithOrgRoles.organization_roles[1]);
  clearActiveOrgRoleSelection(storage);
  assert.equal(storage.getItem(ACTIVE_ORG_ROLE_STORAGE_KEY), null);
});
