/**
 * Fleet Module Access Rules:
 * Access to carrier fleet assets (vehicles, maintenance, drivers, compliance)
 * is restricted to Carrier organizations and Platform Admin.
 * Shippers and Brokers are restricted.
 */

export function isFleetPermittedForOrg({ roleName, orgType, hasPermission }) {
  if (roleName === 'Platform Admin') {
    return true;
  }

  const normalizedType = orgType ? String(orgType).toLowerCase() : '';
  if (normalizedType !== 'carrier') {
    return false;
  }

  if (typeof hasPermission === 'function') {
    return (
      hasPermission('vehicles', 'read') ||
      hasPermission('fleet', 'read') ||
      hasPermission('fleet_assignments', 'read') ||
      hasPermission('hos_logs', 'read')
    );
  }

  return true;
}

