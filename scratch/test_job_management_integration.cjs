/**
 * End-to-End Integration Test for FMS Job Management
 * Verifies backend API endpoints, booking confirmation auto-creation,
 * state machine transitions, driver/truck assignment, and multi-tenant isolation.
 */
const http = require('http');

const JWT_SECRET = 'fms-development-secret-2026';

function base64UrlEncode(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function generateDevToken(payload) {
  const crypto = require('crypto');
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

const tokenPlatformAdmin = generateDevToken({
  userId: 2,
  organizationId: 2,
  roleId: 5,
  email: 'sona@freight.com',
});

const tokenOrg2 = generateDevToken({
  userId: 51,
  organizationId: 2,
  roleId: 1,
  email: 'sona@testfreight.com',
});

const tokenCarrier2122 = generateDevToken({
  userId: 3360,
  organizationId: 2122,
  roleId: 2,
  email: 'carrier1_1791781806342@test.com',
});

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('====================================================');
  console.log('STARTING FMS JOB MANAGEMENT INTEGRATION VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // 1. GET /v1/jobs for Org 2
  console.log('--- 1. Testing GET /v1/jobs ---');
  const listRes = await request({
    hostname: 'localhost',
    port: 8001,
    path: '/v1/jobs?page=1&limit=10',
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenOrg2}` },
  });
  assert(listRes.status === 200, `GET /v1/jobs returned HTTP ${listRes.status} (expected 200)`);
  assert(listRes.body.success === true, 'Response body success is true');
  assert(Array.isArray(listRes.body.data), 'Response data is an array');
  console.log(`Retrieved ${listRes.body.data.length} jobs for Org #2. Total: ${listRes.body.pagination?.total || 0}`);

  // 2. Filter /v1/jobs by status
  console.log('\n--- 2. Testing GET /v1/jobs with status filter ---');
  const filteredRes = await request({
    hostname: 'localhost',
    port: 8001,
    path: '/v1/jobs?status=booked',
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenOrg2}` },
  });
  assert(filteredRes.status === 200, `GET /v1/jobs?status=booked returned HTTP ${filteredRes.status}`);
  const allBooked = (filteredRes.body.data || []).every((j) => j.status === 'booked');
  assert(allBooked, 'All filtered jobs have status = booked');

  // 3. Create a fresh shipment and book it to verify automatic Job creation
  console.log('\n--- 3. Testing Shipment Booking -> Automatic Job Creation ---');
  const createShipmentRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: '/v1/shipments',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenOrg2}`,
        'Content-Type': 'application/json',
      },
    },
    {
      customer_id: 1,
      origin: { city: 'Atlanta', state: 'GA', address: '100 Peachtree St', postal_code: '30303' },
      destination: { city: 'Savannah', state: 'GA', address: '500 River St', postal_code: '31401' },
      pickup_date: new Date(Date.now() + 86400000).toISOString(),
      estimated_delivery: new Date(Date.now() + 172800000).toISOString(),
      cargo_details: { description: 'Automotive Parts Pallets', weight: 14500, freight_class: '70' },
      special_instructions: 'Job E2E Integration Test Shipment',
    }
  );
  assert(createShipmentRes.status === 201, `POST /v1/shipments returned HTTP ${createShipmentRes.status}`);
  const testShipment = createShipmentRes.body.data;
  const shipmentId = testShipment.id;
  console.log(`Created test shipment #${shipmentId} (${testShipment.reference_number})`);

  // Book shipment with compliant carrier Org #2122
  const bookRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/shipments/${shipmentId}/book`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenOrg2}`,
        'Content-Type': 'application/json',
      },
    },
    {
      carrier_org_id: 2122,
      linehaul_rate: 1850,
      notes: 'Automated Job Creation Verification',
    }
  );
  assert(bookRes.status === 200, `POST /v1/shipments/${shipmentId}/book returned HTTP ${bookRes.status}`);

  // 4. Verify Job was automatically created for this shipment: GET /v1/shipments/:id/job
  console.log('\n--- 4. Testing GET /v1/shipments/:id/job for Auto-Generated Job ---');
  const jobLookupRes = await request({
    hostname: 'localhost',
    port: 8001,
    path: `/v1/shipments/${shipmentId}/job`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenOrg2}` },
  });
  assert(jobLookupRes.status === 200, `GET /v1/shipments/${shipmentId}/job returned HTTP ${jobLookupRes.status}`);
  const linkedJob = jobLookupRes.body.data;
  assert(linkedJob && linkedJob.id, `Linked job exists with ID ${linkedJob?.id}`);
  assert(linkedJob.job_number && linkedJob.job_number.startsWith('JOB-'), `Job number formatted correctly: ${linkedJob?.job_number}`);
  assert(linkedJob.status === 'booked', `Job initial status is 'booked' (got '${linkedJob?.status}')`);
  assert(linkedJob.shipment_id === shipmentId, `Job shipment_id matches #${shipmentId}`);
  assert(linkedJob.carrier_org_id === 2122, `Job carrier_org_id matches Carrier #2122`);

  // 5. GET /v1/jobs/:id directly
  console.log('\n--- 5. Testing GET /v1/jobs/:id ---');
  const getJobRes = await request({
    hostname: 'localhost',
    port: 8001,
    path: `/v1/jobs/${linkedJob.id}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenOrg2}` },
  });
  assert(getJobRes.status === 200, `GET /v1/jobs/${linkedJob.id} returned HTTP ${getJobRes.status}`);
  assert(getJobRes.body.data.id === linkedJob.id, 'Fetched job details match expected ID');

  // 6. Test Shipper Security Restriction: Shippers cannot advance operational status
  console.log('\n--- 6. Testing Shipper Security Guard on Status Transitions ---');
  const shipperBlockedRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/jobs/${linkedJob.id}/status`,
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenOrg2}`,
        'Content-Type': 'application/json',
      },
    },
    { status: 'assigned', notes: 'Shipper attempting operational status advance' }
  );
  assert(shipperBlockedRes.status === 403, `Shipper operational status advance rejected with HTTP 403 (got ${shipperBlockedRes.status})`);
  assert(shipperBlockedRes.body.message.includes('Shippers cannot update operational job status'), 'Backend returns shipper security message');

  // 7. Test Operational Transitions via Authorized Platform Admin / Carrier
  console.log('\n--- 7. Testing Authorized State Transitions via Platform Admin ---');
  // Transition booked -> assigned
  const toAssignedRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/jobs/${linkedJob.id}/status`,
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenPlatformAdmin}`,
        'Content-Type': 'application/json',
      },
    },
    { status: 'assigned', notes: 'Advancing to assigned status' }
  );
  assert(toAssignedRes.status === 200, `PATCH to 'assigned' returned HTTP ${toAssignedRes.status}`);
  assert(toAssignedRes.body.data.status === 'assigned', `Job status is now 'assigned'`);

  // Transition assigned -> dispatched
  const toDispatchedRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/jobs/${linkedJob.id}/status`,
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenPlatformAdmin}`,
        'Content-Type': 'application/json',
      },
    },
    { status: 'dispatched', notes: 'Driver dispatched to pickup' }
  );
  assert(toDispatchedRes.status === 200, `PATCH to 'dispatched' returned HTTP ${toDispatchedRes.status}`);
  assert(toDispatchedRes.body.data.status === 'dispatched', `Job status is now 'dispatched'`);

  // Transition dispatched -> in_transit
  const toInTransitRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/jobs/${linkedJob.id}/status`,
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenPlatformAdmin}`,
        'Content-Type': 'application/json',
      },
    },
    { status: 'in_transit', notes: 'Cargo loaded, wheels rolling' }
  );
  assert(toInTransitRes.status === 200, `PATCH to 'in_transit' returned HTTP ${toInTransitRes.status}`);
  assert(toInTransitRes.body.data.status === 'in_transit', `Job status is now 'in_transit'`);

  // 8. Test Negative Case: Invalid transition from in_transit -> booked (should be rejected with 400)
  console.log('\n--- 8. Testing Invalid Transition Rejection (Negative Test) ---');
  const invalidTransitionRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/jobs/${linkedJob.id}/status`,
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenPlatformAdmin}`,
        'Content-Type': 'application/json',
      },
    },
    { status: 'booked', notes: 'Invalid rollback attempt' }
  );
  assert(invalidTransitionRes.status === 400, `Invalid status rollback returned HTTP 400 (got ${invalidTransitionRes.status})`);
  assert(invalidTransitionRes.body.success === false, 'Invalid transition responded with success = false');

  // Complete job: in_transit -> completed
  const toCompletedRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/jobs/${linkedJob.id}/status`,
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenPlatformAdmin}`,
        'Content-Type': 'application/json',
      },
    },
    { status: 'completed', notes: 'Delivery finished successfully' }
  );
  assert(toCompletedRes.status === 200, `PATCH to 'completed' returned HTTP ${toCompletedRes.status}`);
  assert(toCompletedRes.body.data.status === 'completed', `Job status is now 'completed'`);

  // 8. Test POST /v1/jobs/:id/assign on a new job
  console.log('\n--- 8. Testing POST /v1/jobs/:id/assign ---');
  // Create another shipment & booking with agreed rate (which triggers Rate Confirmation)
  const ship2Res = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: '/v1/shipments',
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOrg2}`, 'Content-Type': 'application/json' },
    },
    {
      customer_id: 1,
      origin: { city: 'Dallas', state: 'TX' },
      destination: { city: 'Houston', state: 'TX' },
      pickup_date: new Date(Date.now() + 86400000).toISOString(),
      estimated_delivery: new Date(Date.now() + 172800000).toISOString(),
      cargo_details: { description: 'Electronics', weight: 8000 },
    }
  );
  const ship2Id = ship2Res.body.data.id;
  const bookShip2Res = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/shipments/${ship2Id}/book`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOrg2}`, 'Content-Type': 'application/json' },
    },
    { carrier_org_id: 2122, quote_amount: 1200, linehaul_rate: 1200, notes: 'Direct Job Assign Verification' }
  );
  assert(bookShip2Res.status === 200, `POST /v1/shipments/${ship2Id}/book returned HTTP 200`);
  const rc = bookShip2Res.body.data?.rate_confirmation;
  assert(rc && rc.id, `Rate Confirmation generated with ID ${rc?.id}`);

  // Sign rate confirmation via carrier #2122 to satisfy dispatch prerequisite
  const signRcRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/rate-confirmations/${rc.id}/sign`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenCarrier2122}`,
        'Content-Type': 'application/json',
      },
    },
    { signer_name: 'Carrier 1 Dispatcher', signer_email: 'carrier1_1791781806342@test.com' }
  );
  assert(signRcRes.status === 200, `POST /v1/rate-confirmations/${rc.id}/sign returned HTTP 200`);

  const job2Res = await request({
    hostname: 'localhost',
    port: 8001,
    path: `/v1/shipments/${ship2Id}/job`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenOrg2}` },
  });
  const job2 = job2Res.body.data;
  assert(job2 && job2.id, `Job #2 retrieved with ID ${job2?.id}`);

  const assignPayload = {
    driver_id: 2567,
    notes: 'Assigning driver & equipment via Job Console',
  };

  const assignRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/jobs/${job2.id}/assign`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenPlatformAdmin}`,
        'Content-Type': 'application/json',
      },
    },
    assignPayload
  );
  assert(assignRes.status === 200, `POST /v1/jobs/${job2.id}/assign returned HTTP ${assignRes.status}`);
  assert(assignRes.body.data.status === 'dispatched', `Job status transitioned to 'dispatched' after assignment`);

  // 9. Multi-Tenant Isolation: Carrier Org #2122 vs Shipper Org #2
  console.log('\n--- 9. Testing Multi-Tenant Data Isolation ---');
  const carrierJobsRes = await request({
    hostname: 'localhost',
    port: 8001,
    path: '/v1/jobs',
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenCarrier2122}` },
  });
  assert(carrierJobsRes.status === 200, `GET /v1/jobs for Carrier Org #2122 returned HTTP ${carrierJobsRes.status}`);
  const carrierJobs = carrierJobsRes.body.data || [];
  console.log(`Carrier Org #2122 retrieved ${carrierJobs.length} jobs.`);
  const carrierIsolated = carrierJobs.length > 0 && carrierJobs.every((j) => j.carrier_org_id === 2122);
  assert(carrierIsolated, 'All jobs returned to Carrier Org #2122 strictly have carrier_org_id === 2122');

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
