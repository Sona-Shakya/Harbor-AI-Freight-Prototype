import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Briefcase,
  Truck,
  Path,
  Tag,
  UsersThree,
  GitBranch,
  ShoppingBag,
  Buildings,
  WarningCircle,
  CheckCircle,
  ArrowsClockwise,
  ArrowRight,
  Plus,
  MagnifyingGlass,
  Receipt,
  Boat,
  Files,
  GearSix,
  IdentificationBadge
} from '@phosphor-icons/react';
import {
  getShipments,
  getJobs,
  getDispatchBoard,
  getQuotes,
  getCustomers,
  getBranches,
  getAccounts,
  getFleetDrivers,
  getVehicles
} from './api';
import './styles/dashboard.css';

export default function Dashboard({
  profile,
  currentOrg,
  role,
  records,
  openModule,
  openMission,
  hasPermission = () => false,
  notify = () => {}
}) {
  const isPlatformAdmin = role?.name === 'Platform Admin';
  const isCompanyAdmin = role?.name === 'Company Admin';
  const orgType = currentOrg?.type || profile?.organization?.type || 'shipper';

  // Metrics State
  const [metrics, setMetrics] = useState({
    shipments: { count: profile?.record_counts?.shipments ?? null, breakdown: null, loading: true, error: null },
    jobs: { count: profile?.record_counts?.jobs ?? null, breakdown: null, loading: true, error: null },
    dispatch: { count: null, unassigned: 0, exceptions: 0, loading: true, error: null },
    quotes: { count: profile?.record_counts?.quotes ?? null, loading: true, error: null },
    users: { count: profile?.record_counts?.users ?? null, loading: true, error: null },
    customers: { count: null, loading: true, error: null },
    branches: { count: null, loading: true, error: null },
    fleet: { vehicles: profile?.record_counts?.vehicles ?? null, drivers: profile?.record_counts?.drivers ?? null, loading: true, error: null }
  });

  const [refreshing, setRefreshing] = useState(false);

  // Fetch organization-scoped live metrics
  const fetchDashboardMetrics = useCallback(async () => {
    setRefreshing(true);

    const checkPerm = (m, a) => (typeof hasPermission === 'function' ? hasPermission(m, a) : false);

    // Prepare requests conditionally based on permissions & tenant type
    const tasks = [
      // 0. Shipments
      (checkPerm('shipments', 'read') || isCompanyAdmin || isPlatformAdmin)
        ? getShipments({ limit: 100 })
        : Promise.resolve(null),

      // 1. Jobs
      (checkPerm('jobs', 'read') || checkPerm('shipments', 'read') || isCompanyAdmin || isPlatformAdmin)
        ? getJobs({ limit: 100 })
        : Promise.resolve(null),

      // 2. Dispatch Board
      (checkPerm('dispatch', 'read') || isCompanyAdmin || isPlatformAdmin)
        ? getDispatchBoard()
        : Promise.resolve(null),

      // 3. Quotes
      (checkPerm('quotes', 'read') || isCompanyAdmin || isPlatformAdmin)
        ? getQuotes({ limit: 50 })
        : Promise.resolve(null),

      // 4. Team Users
      (checkPerm('users', 'read') || isCompanyAdmin || isPlatformAdmin)
        ? getAccounts()
        : Promise.resolve(null),

      // 5. Customers
      (checkPerm('customers', 'read') || isCompanyAdmin || isPlatformAdmin)
        ? getCustomers({ limit: 50 })
        : Promise.resolve(null),

      // 6. Branches
      (checkPerm('branches', 'read') || isCompanyAdmin || isPlatformAdmin)
        ? getBranches()
        : Promise.resolve(null),

      // 7. Vehicles (Fleet)
      (checkPerm('vehicles', 'read') || orgType === 'carrier' || isCompanyAdmin || isPlatformAdmin)
        ? getVehicles()
        : Promise.resolve(null),

      // 8. Drivers
      (checkPerm('drivers', 'read') || orgType === 'carrier' || isCompanyAdmin || isPlatformAdmin)
        ? getFleetDrivers()
        : Promise.resolve(null)
    ];

    try {
      const [
        shipmentsRes,
        jobsRes,
        dispatchRes,
        quotesRes,
        usersRes,
        customersRes,
        branchesRes,
        vehiclesRes,
        driversRes
      ] = await Promise.allSettled(tasks);

      setMetrics((prev) => {
        const next = { ...prev };

        // 0. Shipments
        if (shipmentsRes.status === 'fulfilled') {
          if (shipmentsRes.value) {
            const list = Array.isArray(shipmentsRes.value)
              ? shipmentsRes.value
              : shipmentsRes.value?.data || shipmentsRes.value?.shipments || [];
            const total = shipmentsRes.value?.pagination?.total ?? list.length;
            const inTransit = list.filter((s) => s.status === 'in_transit').length;
            const booked = list.filter((s) => s.status === 'booked' || s.status === 'dispatched').length;
            const delivered = list.filter((s) => s.status === 'delivered' || s.status === 'closed').length;
            next.shipments = {
              count: total,
              breakdown: `${booked} booked · ${inTransit} in transit · ${delivered} delivered`,
              loading: false,
              error: null
            };
          } else {
            next.shipments = { ...prev.shipments, loading: false };
          }
        } else {
          next.shipments = {
            count: profile?.record_counts?.shipments ?? null,
            breakdown: null,
            loading: false,
            error: shipmentsRes.reason?.message || 'Failed to load'
          };
        }

        // 1. Jobs
        if (jobsRes.status === 'fulfilled') {
          if (jobsRes.value) {
            const list = Array.isArray(jobsRes.value)
              ? jobsRes.value
              : jobsRes.value?.data || [];
            const total = jobsRes.value?.pagination?.total ?? list.length;
            const pendingAssign = list.filter((j) => j.status === 'booked' || j.status === 'assigned').length;
            const active = list.filter((j) => j.status === 'dispatched' || j.status === 'in_transit').length;
            const completed = list.filter((j) => j.status === 'completed').length;
            next.jobs = {
              count: total,
              breakdown: `${pendingAssign} pending dispatch · ${active} active · ${completed} completed`,
              loading: false,
              error: null
            };
          } else {
            next.jobs = { ...prev.jobs, loading: false };
          }
        } else {
          next.jobs = {
            count: profile?.record_counts?.jobs ?? null,
            breakdown: null,
            loading: false,
            error: jobsRes.reason?.message || 'Failed to load'
          };
        }

        // 2. Dispatch Board
        if (dispatchRes.status === 'fulfilled') {
          if (dispatchRes.value) {
            const d = dispatchRes.value?.data || dispatchRes.value;
            const sum = d?.summary || {};
            const total = sum.total_loads ?? (d?.shipments?.length || 0);
            const unassigned = sum.unassigned_booked_loads ?? 0;
            const exceptions = sum.open_exceptions ?? 0;
            next.dispatch = {
              count: total,
              unassigned,
              exceptions,
              loading: false,
              error: null
            };
          } else {
            next.dispatch = { ...prev.dispatch, loading: false };
          }
        } else {
          next.dispatch = {
            count: null,
            unassigned: 0,
            exceptions: 0,
            loading: false,
            error: dispatchRes.reason?.message || 'Failed to load'
          };
        }

        // 3. Quotes
        if (quotesRes.status === 'fulfilled') {
          if (quotesRes.value) {
            const list = Array.isArray(quotesRes.value)
              ? quotesRes.value
              : quotesRes.value?.data || quotesRes.value?.quotes || [];
            const total = quotesRes.value?.pagination?.total ?? list.length;
            next.quotes = {
              count: total,
              loading: false,
              error: null
            };
          } else {
            next.quotes = { ...prev.quotes, loading: false };
          }
        } else {
          next.quotes = {
            count: profile?.record_counts?.quotes ?? null,
            loading: false,
            error: quotesRes.reason?.message || 'Failed to load'
          };
        }

        // 4. Users
        if (usersRes.status === 'fulfilled') {
          if (usersRes.value) {
            const list = Array.isArray(usersRes.value)
              ? usersRes.value
              : usersRes.value?.data || usersRes.value?.users || [];
            next.users = {
              count: list.length,
              loading: false,
              error: null
            };
          } else {
            next.users = { ...prev.users, loading: false };
          }
        } else {
          next.users = {
            count: profile?.record_counts?.users ?? null,
            loading: false,
            error: usersRes.reason?.message || 'Failed to load'
          };
        }

        // 5. Customers
        if (customersRes.status === 'fulfilled') {
          if (customersRes.value) {
            const list = Array.isArray(customersRes.value)
              ? customersRes.value
              : customersRes.value?.data || customersRes.value?.customers || [];
            const total = customersRes.value?.pagination?.total ?? list.length;
            next.customers = {
              count: total,
              loading: false,
              error: null
            };
          } else {
            next.customers = { ...prev.customers, loading: false };
          }
        } else {
          next.customers = {
            count: null,
            loading: false,
            error: customersRes.reason?.message || 'Failed to load'
          };
        }

        // 6. Branches
        if (branchesRes.status === 'fulfilled') {
          if (branchesRes.value) {
            const list = Array.isArray(branchesRes.value)
              ? branchesRes.value
              : branchesRes.value?.data || branchesRes.value?.branches || [];
            const total = branchesRes.value?.pagination?.total ?? list.length;
            next.branches = {
              count: total,
              loading: false,
              error: null
            };
          } else {
            next.branches = { ...prev.branches, loading: false };
          }
        } else {
          next.branches = {
            count: null,
            loading: false,
            error: branchesRes.reason?.message || 'Failed to load'
          };
        }

        // 7 & 8. Fleet Vehicles & Drivers
        let vehCount = prev.fleet.vehicles;
        let drvCount = prev.fleet.drivers;
        let fleetErr = null;

        if (vehiclesRes.status === 'fulfilled' && vehiclesRes.value) {
          const list = Array.isArray(vehiclesRes.value)
            ? vehiclesRes.value
            : vehiclesRes.value?.data || vehiclesRes.value?.vehicles || [];
          vehCount = vehiclesRes.value?.pagination?.total ?? list.length;
        } else if (vehiclesRes.status === 'rejected') {
          fleetErr = vehiclesRes.reason?.message;
        }

        if (driversRes.status === 'fulfilled' && driversRes.value) {
          const list = Array.isArray(driversRes.value)
            ? driversRes.value
            : driversRes.value?.data || driversRes.value?.drivers || [];
          drvCount = driversRes.value?.pagination?.total ?? list.length;
        } else if (driversRes.status === 'rejected') {
          fleetErr = fleetErr || driversRes.reason?.message;
        }

        next.fleet = {
          vehicles: vehCount,
          drivers: drvCount,
          loading: false,
          error: fleetErr
        };

        return next;
      });
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setRefreshing(false);
    }
  }, [currentOrg?.id, hasPermission, isCompanyAdmin, isPlatformAdmin, orgType, profile]);

  useEffect(() => {
    fetchDashboardMetrics();
  }, [fetchDashboardMetrics]);

  return (
    <div className="fms-dashboard">
      {/* 1. Header & Active Organization Context Banner */}
      <div className="dash-banner">
        <div className="dash-banner-left">
          <h1>
            <span>{currentOrg?.legal_name || profile?.organization?.legal_name || 'Organization Workspace'}</span>
          </h1>
          <p>
            {isCompanyAdmin
              ? 'Company Admin Console — Full organization-wide operational, commercial, and team visibility.'
              : `Operational workspace for ${role?.name || 'User'}.`}
          </p>
          <div className="dash-badges">
            <span className={`dash-badge org-type-${orgType}`}>
              <Buildings size={14} />
              <span>{orgType.toUpperCase()} TENANT</span>
            </span>
            <span className="dash-badge role">
              <IdentificationBadge size={14} />
              <span>{role?.name || 'Company Admin'}</span>
            </span>
            <span className="dash-badge scope" title="Tenant Isolation Guarantee">
              <CheckCircle size={14} />
              <span>Org #{currentOrg?.id || profile?.organization?.id} Isolated</span>
            </span>
          </div>
        </div>

        <div className="dash-banner-actions">
          <button
            type="button"
            className="dash-action-btn"
            onClick={fetchDashboardMetrics}
            disabled={refreshing}
            title="Refresh Organization Metrics"
          >
            <ArrowsClockwise size={16} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Metrics'}</span>
          </button>
          {isCompanyAdmin && (
            <button
              type="button"
              className="dash-action-btn"
              onClick={() => openModule('admin')}
              title="System Settings Registry"
            >
              <GearSix size={16} />
              <span>Settings</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Fast Actions Bar */}
      <div className="dash-actions-bar">
        <button
          type="button"
          className="dash-action-btn primary"
          onClick={() => openModule('shipments', { action: 'create' })}
          title="Create New Multi-Stop Shipment Order"
        >
          <Plus size={16} weight="bold" />
          <span>New Shipment</span>
        </button>

        <button
          type="button"
          className="dash-action-btn"
          onClick={() => openModule('quotes', { action: 'create' })}
          title="Spot Rate Quote & Rating Engine"
        >
          <Tag size={16} />
          <span>Calculate Quote</span>
        </button>

        <button
          type="button"
          className="dash-action-btn"
          onClick={() => openModule('load_board')}
          title="Search Load Board Postings & Place Bids"
        >
          <MagnifyingGlass size={16} />
          <span>Find Loads</span>
        </button>

        <button
          type="button"
          className="dash-action-btn"
          onClick={() => openModule('jobs')}
          title="Operational Transport Job Console"
        >
          <Briefcase size={16} />
          <span>Job Console</span>
        </button>

        <button
          type="button"
          className="dash-action-btn"
          onClick={() => openModule('dispatch')}
          title="Live Dispatch & Execution Board"
        >
          <Path size={16} />
          <span>Dispatch Board</span>
        </button>
      </div>

      {/* 3. Operational Summary & KPI Metrics Grid */}
      <div className="dash-section-title">
        <span>Organization Operational Summary</span>
        <span className="dash-section-subtitle">Real-world persisted database records</span>
      </div>

      <div className="dash-metrics-grid">
        {/* Card 1: Shipments */}
        <div
          className="dash-metric-card"
          onClick={() => openModule('shipments')}
          role="button"
          tabIndex={0}
          title="Open Shipment Operations"
        >
          <div className="dash-metric-top">
            <div className="dash-metric-icon" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
              <Package size={22} />
            </div>
            <ArrowRight size={16} className="dash-metric-arrow" />
          </div>
          <div>
            <div className="dash-metric-label">Shipment Orders</div>
            <div className="dash-metric-value">
              {metrics.shipments.loading ? (
                <ArrowsClockwise size={20} className="spin" />
              ) : metrics.shipments.error ? (
                <span style={{ fontSize: '16px', color: '#b45309' }}>Unavailable</span>
              ) : (
                metrics.shipments.count ?? 0
              )}
            </div>
            {metrics.shipments.error ? (
              <div className="dash-metric-error">
                <WarningCircle size={14} />
                <span>Failed to load count</span>
              </div>
            ) : metrics.shipments.breakdown ? (
              <div className="dash-metric-breakdown">{metrics.shipments.breakdown}</div>
            ) : (
              <div className="dash-metric-empty">Click to manage shipment orders</div>
            )}
          </div>
        </div>

        {/* Card 2: Operational Jobs */}
        <div
          className="dash-metric-card"
          onClick={() => openModule('jobs')}
          role="button"
          tabIndex={0}
          title="Open Operational Job Console"
        >
          <div className="dash-metric-top">
            <div className="dash-metric-icon" style={{ background: '#f5f3ff', color: '#6d28d9' }}>
              <Briefcase size={22} />
            </div>
            <ArrowRight size={16} className="dash-metric-arrow" />
          </div>
          <div>
            <div className="dash-metric-label">Operational Jobs</div>
            <div className="dash-metric-value">
              {metrics.jobs.loading ? (
                <ArrowsClockwise size={20} className="spin" />
              ) : metrics.jobs.error ? (
                <span style={{ fontSize: '16px', color: '#b45309' }}>Unavailable</span>
              ) : (
                metrics.jobs.count ?? 0
              )}
            </div>
            {metrics.jobs.error ? (
              <div className="dash-metric-error">
                <WarningCircle size={14} />
                <span>Failed to load count</span>
              </div>
            ) : metrics.jobs.breakdown ? (
              <div className="dash-metric-breakdown">{metrics.jobs.breakdown}</div>
            ) : (
              <div className="dash-metric-empty">Lifecycle execution tracking</div>
            )}
          </div>
        </div>

        {/* Card 3: Dispatch Board */}
        <div
          className="dash-metric-card"
          onClick={() => openModule('dispatch')}
          role="button"
          tabIndex={0}
          title="Open Live Dispatch Board"
        >
          <div className="dash-metric-top">
            <div className="dash-metric-icon" style={{ background: '#ecfdf5', color: '#047857' }}>
              <Path size={22} />
            </div>
            <ArrowRight size={16} className="dash-metric-arrow" />
          </div>
          <div>
            <div className="dash-metric-label">Dispatch Board</div>
            <div className="dash-metric-value">
              {metrics.dispatch.loading ? (
                <ArrowsClockwise size={20} className="spin" />
              ) : metrics.dispatch.error ? (
                <span style={{ fontSize: '16px', color: '#b45309' }}>Unavailable</span>
              ) : (
                metrics.dispatch.count ?? 0
              )}
            </div>
            {metrics.dispatch.error ? (
              <div className="dash-metric-error">
                <WarningCircle size={14} />
                <span>Failed to load board</span>
              </div>
            ) : (
              <div className="dash-metric-breakdown">
                {metrics.dispatch.unassigned > 0
                  ? `${metrics.dispatch.unassigned} unassigned · `
                  : 'All assigned · '}
                {metrics.dispatch.exceptions > 0
                  ? `${metrics.dispatch.exceptions} active exception(s)`
                  : '0 exceptions'}
              </div>
            )}
          </div>
        </div>

        {/* Card 4: Quotes & Pricing */}
        <div
          className="dash-metric-card"
          onClick={() => openModule('quotes')}
          role="button"
          tabIndex={0}
          title="Open Quotes & Rates"
        >
          <div className="dash-metric-top">
            <div className="dash-metric-icon" style={{ background: '#fffbeb', color: '#b45309' }}>
              <Tag size={22} />
            </div>
            <ArrowRight size={16} className="dash-metric-arrow" />
          </div>
          <div>
            <div className="dash-metric-label">Quotes & Rates</div>
            <div className="dash-metric-value">
              {metrics.quotes.loading ? (
                <ArrowsClockwise size={20} className="spin" />
              ) : metrics.quotes.error ? (
                <span style={{ fontSize: '16px', color: '#b45309' }}>Unavailable</span>
              ) : (
                metrics.quotes.count ?? 0
              )}
            </div>
            {metrics.quotes.error ? (
              <div className="dash-metric-error">
                <WarningCircle size={14} />
                <span>Failed to load quotes</span>
              </div>
            ) : (
              <div className="dash-metric-breakdown">Active spot rates & agreements</div>
            )}
          </div>
        </div>

        {/* Card 5: Customers & Accounts */}
        <div
          className="dash-metric-card"
          onClick={() => openModule('customers')}
          role="button"
          tabIndex={0}
          title="Open Customer Accounts"
        >
          <div className="dash-metric-top">
            <div className="dash-metric-icon" style={{ background: '#fdf2f8', color: '#be185d' }}>
              <ShoppingBag size={22} />
            </div>
            <ArrowRight size={16} className="dash-metric-arrow" />
          </div>
          <div>
            <div className="dash-metric-label">Shipper Customers</div>
            <div className="dash-metric-value">
              {metrics.customers.loading ? (
                <ArrowsClockwise size={20} className="spin" />
              ) : metrics.customers.error ? (
                <span style={{ fontSize: '16px', color: '#b45309' }}>Unavailable</span>
              ) : (
                metrics.customers.count ?? 0
              )}
            </div>
            {metrics.customers.error ? (
              <div className="dash-metric-error">
                <WarningCircle size={14} />
                <span>Failed to load customers</span>
              </div>
            ) : (
              <div className="dash-metric-breakdown">Registered shipper partners</div>
            )}
          </div>
        </div>

        {/* Card 6: Team Users */}
        <div
          className="dash-metric-card"
          onClick={() => openModule('users')}
          role="button"
          tabIndex={0}
          title="Open User Accounts"
        >
          <div className="dash-metric-top">
            <div className="dash-metric-icon" style={{ background: '#f8fafc', color: '#334155' }}>
              <UsersThree size={22} />
            </div>
            <ArrowRight size={16} className="dash-metric-arrow" />
          </div>
          <div>
            <div className="dash-metric-label">Team Members</div>
            <div className="dash-metric-value">
              {metrics.users.loading ? (
                <ArrowsClockwise size={20} className="spin" />
              ) : metrics.users.error ? (
                <span style={{ fontSize: '16px', color: '#b45309' }}>Unavailable</span>
              ) : (
                metrics.users.count ?? 0
              )}
            </div>
            {metrics.users.error ? (
              <div className="dash-metric-error">
                <WarningCircle size={14} />
                <span>Failed to load users</span>
              </div>
            ) : (
              <div className="dash-metric-breakdown">Active employee accounts</div>
            )}
          </div>
        </div>

        {/* Card 7: Branches */}
        <div
          className="dash-metric-card"
          onClick={() => openModule('branches')}
          role="button"
          tabIndex={0}
          title="Open Branch Network"
        >
          <div className="dash-metric-top">
            <div className="dash-metric-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
              <GitBranch size={22} />
            </div>
            <ArrowRight size={16} className="dash-metric-arrow" />
          </div>
          <div>
            <div className="dash-metric-label">Regional Branches</div>
            <div className="dash-metric-value">
              {metrics.branches.loading ? (
                <ArrowsClockwise size={20} className="spin" />
              ) : metrics.branches.error ? (
                <span style={{ fontSize: '16px', color: '#b45309' }}>Unavailable</span>
              ) : (
                metrics.branches.count ?? 0
              )}
            </div>
            {metrics.branches.error ? (
              <div className="dash-metric-error">
                <WarningCircle size={14} />
                <span>Failed to load branches</span>
              </div>
            ) : (
              <div className="dash-metric-breakdown">Offices & operating locations</div>
            )}
          </div>
        </div>

        {/* Card 8: Fleet Assets & Drivers */}
        <div
          className="dash-metric-card"
          onClick={() => openModule('fleet')}
          role="button"
          tabIndex={0}
          title="Open Carriers & Fleet Management"
        >
          <div className="dash-metric-top">
            <div className="dash-metric-icon" style={{ background: '#f1f5f9', color: '#0284c7' }}>
              <Truck size={22} />
            </div>
            <ArrowRight size={16} className="dash-metric-arrow" />
          </div>
          <div>
            <div className="dash-metric-label">Fleet & Drivers</div>
            <div className="dash-metric-value">
              {metrics.fleet.loading ? (
                <ArrowsClockwise size={20} className="spin" />
              ) : metrics.fleet.error ? (
                <span style={{ fontSize: '16px', color: '#b45309' }}>Unavailable</span>
              ) : (
                `${metrics.fleet.vehicles ?? 0} / ${metrics.fleet.drivers ?? 0}`
              )}
            </div>
            {metrics.fleet.error ? (
              <div className="dash-metric-error">
                <WarningCircle size={14} />
                <span>Failed to load fleet</span>
              </div>
            ) : (
              <div className="dash-metric-breakdown">
                {metrics.fleet.vehicles ?? 0} active vehicles · {metrics.fleet.drivers ?? 0} drivers
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Connected Missions & Work Product Review (Harbor Architecture) */}
      <div className="dash-missions-box">
        <div className="dash-section-title" style={{ marginBottom: '8px' }}>
          <span>Your attention makes the difference</span>
          <span className="dash-section-subtitle">Three connected operational missions</span>
        </div>
        <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 16px' }}>
          Source records stay linked to each decision. Open a mission to inspect work products and record resolutions.
        </p>

        <div className="mission-cards">
          {[
            ['import', 'Shanghai import', 'Clarify the excluded destination charge.', Boat],
            ['export', 'September exports', 'Resolve a packing list quantity mismatch.', Files],
            ['invoice', 'Invoice review', 'Review a USD 240 invoice variance.', Receipt]
          ].map(([id, title, desc, Icon]) => (
            <button key={id} onClick={() => openMission(id)} type="button">
              <Icon size={27} />
              <h3>{title}</h3>
              <p>{desc}</p>
              <span>
                Open mission <ArrowRight />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

