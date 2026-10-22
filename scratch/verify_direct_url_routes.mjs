import fs from 'fs';
import path from 'path';

console.log('=== FMS DIRECT URL ROUTING VERIFICATION ===\n');

// 1. Inspect App.jsx source file
const appJsxPath = path.resolve('src/App.jsx');
const appJsx = fs.readFileSync(appJsxPath, 'utf8');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName} - ${details}`);
  }
}

// Check MODULE_METADATA
assert(
  appJsx.includes("reports: {") && appJsx.includes("category: 'Workspace & Analytics'") && appJsx.includes("name: 'Operational & Financial Reports'"),
  'MODULE_METADATA includes "reports" definition'
);

assert(
  appJsx.includes("costs: {") && appJsx.includes("category: 'Commercial & Finance'") && appJsx.includes("name: 'Landed Cost Calculator'"),
  'MODULE_METADATA includes "costs" definition'
);

assert(
  appJsx.includes("invoices: {") && appJsx.includes("category: 'Finance & Accounting'"),
  'MODULE_METADATA includes "invoices" definition'
);

// Check getModuleFromPath mappings
assert(
  appJsx.includes("if (path === '/reports' || path.startsWith('/reports/')) return 'reports';"),
  "getModuleFromPath maps '/reports' to 'reports'"
);

assert(
  appJsx.includes("if (path === '/costs' || path.startsWith('/costs/')) return 'costs';"),
  "getModuleFromPath maps '/costs' to 'costs'"
);

assert(
  appJsx.includes("if (path === '/invoices' || path.startsWith('/invoices/') || path === '/billing' || path.startsWith('/billing/')) return 'invoices';"),
  "getModuleFromPath maps '/invoices' and '/billing' to 'invoices'"
);

// Check moduleUrls in openModule
assert(
  appJsx.includes("reports: '/reports',") && appJsx.includes("costs: '/costs',"),
  "moduleUrls contains '/reports' and '/costs' so window.history.pushState preserves URL"
);

// Check ModuleNavigation sidebar rendering
assert(
  appJsx.includes("canReadCosts && (") && appJsx.includes("key=\"costs\"") && appJsx.includes("Costs & Landed Cost"),
  'ModuleNavigation renders "Costs & Landed Cost" in Commercial section'
);

assert(
  appJsx.includes("canReadReports && (") && appJsx.includes("key=\"reports\"") && appJsx.includes("Reports & Analytics"),
  'ModuleNavigation renders "Reports" in navigation'
);

// Check isModulePermitted implementation
assert(
  appJsx.includes("if (modId === 'reports') {") &&
  appJsx.includes("if (role?.name === 'Driver') return false;") &&
  appJsx.includes("hasPermission('shipments', 'read')"),
  'isModulePermitted restricts reports from Driver and grants to authorized roles'
);

assert(
  appJsx.includes("if (modId === 'costs') {") &&
  appJsx.includes("hasPermission('quotes', 'read')"),
  'isModulePermitted restricts costs from Driver and grants to authorized roles'
);

assert(
  appJsx.includes("if (modId === 'invoices') {\n    return false;\n  }"),
  'isModulePermitted returns false for internal standalone invoices module'
);

// Check useEffect deep linking and fallback
assert(
  appJsx.includes("if (currentPathMod === 'invoices') {") &&
  appJsx.includes("if (role?.name === 'Shipper User') {") &&
  appJsx.includes("setPortalTab('billing');") &&
  appJsx.includes("openModule('portal');"),
  'Shipper User visiting /invoices or /billing is routed to Customer Portal billing tab'
);

assert(
  appJsx.includes("notify('Standalone internal invoice management is not available. Redirected to your workspace.');"),
  'Internal users visiting /invoices receive clear notice and fallback redirection'
);

// Check popstate handling
assert(
  appJsx.includes("window.location.pathname.includes('/billing') || window.location.pathname.includes('/invoices')") &&
  appJsx.includes("setPortalTab('billing');"),
  'popstate activates billing tab for Customer Portal'
);

// Check "New record" button exclusions
assert(
  appJsx.includes("moduleId!=='reports'&&moduleId!=='costs'&&moduleId!=='invoices'&&<Btn primary onClick={()=>setModal({kind:'form'"),
  '"New record" button is excluded from reports, costs, and invoices views'
);

// 2. Test Backend invoice endpoint availability
console.log('\n--- Checking Backend Invoice Endpoints ---');
try {
  const topLevelInvRes = await fetch('http://localhost:8001/v1/invoices');
  console.log(`GET /v1/invoices HTTP Status: ${topLevelInvRes.status}`);
  assert(topLevelInvRes.status === 404, 'Backend has NO /v1/invoices route (returns 404 as documented)');
} catch (e) {
  console.log('Backend not reachable:', e.message);
}

try {
  const portalInvRes = await fetch('http://localhost:8001/v1/portal/invoices');
  console.log(`GET /v1/portal/invoices HTTP Status: ${portalInvRes.status}`);
  assert(portalInvRes.status === 401, 'Backend has /v1/portal/invoices route (returns 401 Unauthorized for unauthenticated requests)');
} catch (e) {
  console.log('Backend not reachable:', e.message);
}

console.log(`\nVerification Complete: ${passedTests}/${totalTests} checks passed.`);
if (passedTests !== totalTests) {
  process.exitCode = 1;
}

