/**
 * Milestone 2 End-to-End Workflow Audit & Verification Script
 * Validates the full lifecycle:
 * Booking Confirmed -> Job Created -> Assigned -> Dispatched -> In Transit -> Delivered -> Invoiced / Closed
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

const tokenShipperOrg2 = generateDevToken({
  userId: 51,
  organizationId: 2,
  roleId: 1,
  email: 'companyadmin@freight.com',
});

const tokenCarrier2122 = generateDevToken({
  userId: 3360,
  organizationId: 2122,
  roleId: 2,
  email: 'carrier1_1791781806342@test.com',
});

const tokenCarrierOrg11 = generateDevToken({
  userId: 54,
  organizationId: 11,
  roleId: 1,
  email: 'carrier.admin@probecarrier.com',
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
  console.log('==================================================================');
  console.log('FMS MILESTONE 2: END-TO-END DISPATCH, DELIVERY & INVOICE AUDIT');
  console.log('==================================================================\n');

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

  // -------------------------------------------------------------
  // STAGE 1: SHIPMENT CREATION WITH STOPS & CARGO
  // -------------------------------------------------------------
  console.log('--- STAGE 1: Creating Multi-Stop Shipment (Origin & Destination) ---');
  const createShipmentRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: '/v1/shipments',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenShipperOrg2}`,
        'Content-Type': 'application/json',
      },
    },
    {
      customer_id: 1,
      origin: { city: 'Atlanta', state: 'GA', address: '100 Peachtree St', postal_code: '30303' },
      destination: { city: 'Savannah', state: 'GA', address: '500 River St', postal_code: '31401' },
      pickup_date: new Date(Date.now() + 86400000).toISOString(),
      estimated_delivery: new Date(Date.now() + 172800000).toISOString(),
      cargo_details: { description: 'Industrial Turbines', weight: 32000, freight_class: '70', equipment_type: '53ft Flatbed' },
      special_instructions: 'Milestone 2 Full Lifecycle Test Shipment',
    }
  );
  assert(createShipmentRes.status === 201, `POST /v1/shipments created shipment (HTTP 201)`);
  const shipment = createShipmentRes.body.data;
  const shipmentId = shipment.id;
  console.log(`Shipment created: #${shipmentId} (${shipment.reference_number})`);

  // Add Stop 1 (Pickup)
  const addStop1Res = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/shipments/${shipmentId}/stops`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenShipperOrg2}`, 'Content-Type': 'application/json' },
    },
    {
      sequence: 1,
      type: 'pickup',
      address: { city: 'Atlanta', state: 'GA', line1: '100 Peachtree St', zip: '30303' },
      appointment_window: '08:00 - 11:00',
      notes: 'Dock #4, check in at shipping desk',
    }
  );
  assert(addStop1Res.status === 201 || addStop1Res.status === 200, `Added Stop #1 (Pickup) successfully (HTTP ${addStop1Res.status})`);
  const stop1 = addStop1Res.body.data?.stop || addStop1Res.body.data;

  // Add Stop 2 (Dropoff / Delivery)
  const addStop2Res = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/shipments/${shipmentId}/stops`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenShipperOrg2}`, 'Content-Type': 'application/json' },
    },
    {
      sequence: 2,
      type: 'dropoff',
      address: { city: 'Savannah', state: 'GA', line1: '500 River St', zip: '31401' },
      appointment_window: '14:00 - 17:00',
      notes: 'Receiving bay #2, POD signature required',
    }
  );
  assert(addStop2Res.status === 201 || addStop2Res.status === 200, `Added Stop #2 (Dropoff) successfully (HTTP ${addStop2Res.status})`);
  const stop2 = addStop2Res.body.data?.stop || addStop2Res.body.data;

  // -------------------------------------------------------------
  // STAGE 2: BOOKING CONFIRMATION -> EXACTLY ONE JOB CREATED
  // -------------------------------------------------------------
  console.log('\n--- STAGE 2: Booking Confirmation & Automatic Job Generation ---');
  const bookRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/shipments/${shipmentId}/book`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenShipperOrg2}`, 'Content-Type': 'application/json' },
    },
    {
      carrier_org_id: 2122,
      quote_amount: 2450.00,
      linehaul_rate: 2450.00,
      notes: 'Confirmed carrier booking for M2 lifecycle audit',
    }
  );
  assert(bookRes.status === 200, `POST /v1/shipments/${shipmentId}/book succeeded (HTTP 200)`);
  assert(bookRes.body.data.status === 'booked', `Shipment status is 'booked'`);

  // Verify Rate Confirmation generated
  const rc = bookRes.body.data.rate_confirmation;
  assert(rc && rc.id, `Rate Confirmation generated: ID ${rc?.id} (${rc?.confirmation_number})`);
  assert(rc?.status === 'pending_signature', `Rate Confirmation status is 'pending_signature'`);

  // Verify Exactly ONE Job created for this shipment
  const jobLookupRes = await request({
    hostname: 'localhost',
    port: 8001,
    path: `/v1/shipments/${shipmentId}/job`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenShipperOrg2}` },
  });
  assert(jobLookupRes.status === 200, `GET /v1/shipments/${shipmentId}/job returned HTTP 200`);
  const job = jobLookupRes.body.data;
  assert(job && job.id, `Job exists with ID #${job?.id}`);
  assert(job.job_number && job.job_number.startsWith('JOB-'), `Job number formatted correctly: ${job?.job_number}`);
  assert(job.status === 'booked', `Initial Job status is 'booked'`);
  assert(job.shipment_id === shipmentId, `Job links to Shipment #${shipmentId}`);
  assert(job.carrier_org_id === 2122, `Job designates Carrier Org #2122`);

  // Replay booking attempt (Idempotency / Conflict test)
  const replayBookRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/shipments/${shipmentId}/book`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenShipperOrg2}`, 'Content-Type': 'application/json' },
    },
    { carrier_org_id: 2122, quote_amount: 2450.00 }
  );
  assert(replayBookRes.status === 409, `Replay booking rejected with HTTP 409 Conflict ('Shipment is already booked')`);

  // -------------------------------------------------------------
  // STAGE 3: DRIVER & VEHICLE ASSIGNMENT WITH PRE-DISPATCH GUARDS
  // -------------------------------------------------------------
  console.log('\n--- STAGE 3: Pre-Dispatch Guards, Compliance & Asset Assignment ---');

  // Guard 1: Attempt dispatch without signed Rate Confirmation -> MUST FAIL (HTTP 400)
  const unsignedAssignRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/jobs/${job.id}/assign`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenPlatformAdmin}`, 'Content-Type': 'application/json' },
    },
    { driver_id: 2565, notes: 'Attempt dispatch before RC signature' }
  );
  assert(unsignedAssignRes.status === 400, `Dispatch before RC signed rejected with HTTP 400`);
  assert(unsignedAssignRes.body.message.includes('Rate confirmation has not been signed'), 'Error message specifies unsigned RC gating');

  // Sign Rate Confirmation via authorized Carrier User (Org #2122)
  const signRcRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/rate-confirmations/${rc.id}/sign`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCarrier2122}`, 'Content-Type': 'application/json' },
    },
    { signer_name: 'Bob Dispatcher', signer_email: 'carrier1@test.com' }
  );
  assert(signRcRes.status === 200, `Rate confirmation signed by carrier (HTTP 200)`);
  assert(signRcRes.body.data.status === 'signed', `Rate confirmation status is 'signed'`);
  assert(Boolean(signRcRes.body.data.signed_at), `Rate confirmation signed_at recorded`);

  // Guard 2: Active Driver Conflict Detection
  // Driver #2564 is currently active on an in-progress dispatch run
  const driverConflictAssignRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/jobs/${job.id}/assign`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenPlatformAdmin}`, 'Content-Type': 'application/json' },
    },
    { driver_id: 2564, notes: 'Assigning driver with active conflict' }
  );
  assert(driverConflictAssignRes.status === 409, `Active driver conflict detected and blocked with HTTP 409`);
  assert(driverConflictAssignRes.body.message.includes('Driver conflict detected'), 'Conflict message details active run');

  // Guard 3: Active Vehicle Conflict Detection
  // Truck #176 is currently active on an in-progress dispatch run
  const truckConflictAssignRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/jobs/${job.id}/assign`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenPlatformAdmin}`, 'Content-Type': 'application/json' },
    },
    { driver_id: 2573, truck_id: 176, notes: 'Assigning truck with active conflict' }
  );
  assert(truckConflictAssignRes.status === 409, `Active truck conflict detected and blocked with HTTP 409`);
  assert(truckConflictAssignRes.body.message.includes('Vehicle conflict detected'), 'Conflict message details active truck assignment');

  // Assign available driver #2573 (Bob DriverB 2)
  const validAssignRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/jobs/${job.id}/assign`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenPlatformAdmin}`, 'Content-Type': 'application/json' },
    },
    {
      driver_id: 2573,
      notes: 'Driver dispatched via Operational Job Console',
    }
  );
  assert(validAssignRes.status === 200, `POST /v1/jobs/${job.id}/assign succeeded (HTTP 200)`);
  const assignedJob = validAssignRes.body.data;
  assert(assignedJob.status === 'dispatched', `Job status advanced to 'dispatched'`);
  assert(assignedJob.shipment.status === 'dispatched', `Shipment status advanced to 'dispatched'`);
  assert(assignedJob.dispatch_assignments?.length > 0, `Dispatch assignment linked to Job`);
  assert(assignedJob.dispatch_assignments[0].driver_id === 2573, `Assigned driver is #2573`);

  // -------------------------------------------------------------
  // STAGE 4: MILESTONE EXECUTION & TRANSITION TO IN TRANSIT
  // -------------------------------------------------------------
  console.log('\n--- STAGE 4: Milestone Stop Execution & In-Transit Transition ---');

  // Stop 1 (Pickup) Arrive
  const stop1ArriveRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/shipments/${shipmentId}/stops/${stop1.id}/arrive`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenPlatformAdmin}`, 'Content-Type': 'application/json' },
    },
    { notes: 'Driver arrived at Atlanta shipper dock #4' }
  );
  assert(stop1ArriveRes.status === 200, `POST /stops/${stop1.id}/arrive succeeded (HTTP 200)`);
  assert(stop1ArriveRes.body.data.stop.status === 'arrived', `Stop #1 status is 'arrived'`);

  // Stop 1 (Pickup) Depart -> Automatically triggers transition to IN_TRANSIT
  const stop1DepartRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/shipments/${shipmentId}/stops/${stop1.id}/depart`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenPlatformAdmin}`, 'Content-Type': 'application/json' },
    },
    { notes: 'Cargo loaded and secured. Departed origin for Savannah.' }
  );
  assert(stop1DepartRes.status === 200, `POST /stops/${stop1.id}/depart succeeded (HTTP 200)`);
  assert(stop1DepartRes.body.data.stop.status === 'completed', `Stop #1 status is 'completed'`);
  assert(stop1DepartRes.body.data.shipment.status === 'in_transit', `Shipment automatically advanced to 'in_transit'`);

  // Verify Job status synchronized to in_transit
  const jobInTransitRes = await request({
    hostname: 'localhost',
    port: 8001,
    path: `/v1/jobs/${job.id}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenShipperOrg2}` },
  });
  assert(jobInTransitRes.body.data.status === 'in_transit', `Job status synchronized to 'in_transit'`);

  // Verify Check-Call automatically logged
  const checkCallsRes = await request({
    hostname: 'localhost',
    port: 8001,
    path: `/v1/shipments/${shipmentId}/check-calls`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenShipperOrg2}` },
  });
  assert(checkCallsRes.status === 200, `GET /v1/shipments/${shipmentId}/check-calls returned HTTP 200`);
  const checkCalls = checkCallsRes.body.data || [];
  assert(checkCalls.length >= 2, `Check-calls logged for arrive & depart (count: ${checkCalls.length})`);
  assert(checkCalls.some(c => c.note.includes('Departed from Stop #1')), `Check-call contains departure notice`);

  // Verify Tracking visibility endpoint
  const trackingRes = await request({
    hostname: 'localhost',
    port: 8001,
    path: `/v1/portal/shipments/${shipmentId}/tracking`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenShipperOrg2}` },
  });
  assert(trackingRes.status === 200, `GET /v1/portal/shipments/${shipmentId}/tracking returned HTTP 200`);
  const trackingData = trackingRes.body?.data || trackingRes.body;
  assert(trackingData.status === 'in_transit', `Tracking reports status 'in_transit'`);
  assert(Boolean(trackingData.current_location), `Tracking reports current GPS coordinates`);

  // -------------------------------------------------------------
  // STAGE 5: DELIVERY CONFIRMATION & PROOF OF DELIVERY (POD)
  // -------------------------------------------------------------
  console.log('\n--- STAGE 5: Delivery Confirmation & Proof of Delivery (POD) ---');

  // Stop 2 (Dropoff) Arrive
  const stop2ArriveRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/shipments/${shipmentId}/stops/${stop2.id}/arrive`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenPlatformAdmin}`, 'Content-Type': 'application/json' },
    },
    { notes: 'Arrived at Savannah receiving facility' }
  );
  assert(stop2ArriveRes.status === 200, `POST /stops/${stop2.id}/arrive succeeded (HTTP 200)`);
  assert(stop2ArriveRes.body.data.stop.status === 'arrived', `Stop #2 status is 'arrived'`);

  // Upload Signed Proof of Delivery (POD) document
  const podUploadRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/portal/shipments/${shipmentId}/documents`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenShipperOrg2}`, 'Content-Type': 'application/json' },
    },
    {
      type: 'POD',
      file_name: `POD-${shipment.reference_number}.pdf`,
      file_ref: `storage/documents/pod/${shipment.reference_number}.pdf`,
      file_size: 48200,
      mime_type: 'application/pdf',
      notes: 'Signed POD captured by driver on mobile app',
    }
  );
  assert(podUploadRes.status === 201 || podUploadRes.status === 200, `POD document uploaded successfully (HTTP ${podUploadRes.status})`);
  const podDoc = podUploadRes.body.data;
  assert(podDoc.type === 'POD', `Uploaded document type is 'POD'`);
  assert(podDoc.shipment_id === shipmentId, `POD document linked to Shipment #${shipmentId}`);

  // Stop 2 (Dropoff) Depart -> Automatically triggers transition to DELIVERED & INVOICE GENERATION
  const stop2DepartRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/shipments/${shipmentId}/stops/${stop2.id}/depart`,
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenPlatformAdmin}`, 'Content-Type': 'application/json' },
    },
    { notes: 'Unloading complete. Receiver signed POD received in good order.' }
  );
  assert(stop2DepartRes.status === 200, `POST /stops/${stop2.id}/depart succeeded (HTTP 200)`);
  assert(stop2DepartRes.body.data.stop.status === 'completed', `Stop #2 status is 'completed'`);
  assert(stop2DepartRes.body.data.shipment.status === 'delivered', `Shipment automatically advanced to 'delivered'`);
  assert(Boolean(stop2DepartRes.body.data.shipment.actual_delivery), `Actual delivery timestamp recorded`);

  // Verify Job status synchronized to completed
  const jobDeliveredRes = await request({
    hostname: 'localhost',
    port: 8001,
    path: `/v1/jobs/${job.id}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenShipperOrg2}` },
  });
  assert(jobDeliveredRes.body.data.status === 'completed', `Job status synchronized to 'completed'`);

  // -------------------------------------------------------------
  // STAGE 6: AUTO-INVOICE GENERATION & SHIPMENT CLOSURE
  // -------------------------------------------------------------
  console.log('\n--- STAGE 6: Auto-Invoice Verification & Shipment Closure ---');

  // Verify Invoice auto-generated upon delivery
  const invoicesRes = await request({
    hostname: 'localhost',
    port: 8001,
    path: `/v1/portal/invoices?shipment_id=${shipmentId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenShipperOrg2}` },
  });
  assert(invoicesRes.status === 200, `GET /v1/portal/invoices returned HTTP 200`);
  const invoices = invoicesRes.body.invoices || invoicesRes.body.data || [];
  assert(invoices.length === 1, `Exactly ONE invoice generated for shipment (count: ${invoices.length})`);
  const invoice = invoices[0];
  assert(invoice && invoice.id, `Invoice exists with ID #${invoice?.id}`);
  assert(invoice.invoice_number && invoice.invoice_number.startsWith('INV-'), `Invoice number formatted correctly: ${invoice?.invoice_number}`);
  assert(Number(invoice.amount) === 2450.00, `Invoice amount matches agreed rate ($2,450.00)`);
  assert(Number(invoice.amount_paid) === 0, `Invoice amount_paid initialized to $0.00`);
  assert(invoice.status === 'pending', `Invoice initial status is 'pending'`);
  assert(invoice.shipper_org_id === 2, `Invoice strictly scoped to Shipper Org #2`);
  assert(invoice.shipment_id === shipmentId, `Invoice links to Shipment #${shipmentId}`);

  // Fetch full shipment details and verify all relations present
  const fullShipmentRes = await request({
    hostname: 'localhost',
    port: 8001,
    path: `/v1/shipments/${shipmentId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenShipperOrg2}` },
  });
  assert(fullShipmentRes.status === 200, `GET /v1/shipments/${shipmentId} returned HTTP 200`);
  const fullShp = fullShipmentRes.body.data;
  assert(fullShp.documents.some(d => d.type === 'POD'), `Shipment documents array contains POD document`);
  assert(fullShp.documents.some(d => d.type === 'rate_confirmation'), `Shipment documents array contains Rate Confirmation`);
  assert(fullShp.invoices.length === 1, `Shipment invoices array contains auto-generated invoice`);
  assert(fullShp.job.status === 'completed', `Shipment linked job is in status 'completed'`);
  assert(fullShp.status_history.length >= 4, `Full audit status history recorded (count: ${fullShp.status_history.length})`);

  // Transition shipment to CLOSED
  const closeShipmentRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/shipments/${shipmentId}/status`,
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenShipperOrg2}`, 'Content-Type': 'application/json' },
    },
    { status: 'closed', notes: 'All delivery milestones satisfied, invoice generated, shipment closed' }
  );
  assert(closeShipmentRes.status === 200, `PATCH /v1/shipments/${shipmentId}/status to 'closed' succeeded`);
  assert(closeShipmentRes.body.data.status === 'closed', `Shipment final status is 'closed'`);

  // -------------------------------------------------------------
  // STAGE 7: SECURITY, TENANT ISOLATION & INVALID TRANSITION GUARDS
  // -------------------------------------------------------------
  console.log('\n--- STAGE 7: Security, Tenant Isolation & Invalid State Guards ---');

  // Guard 1: Cross-tenant invoice access is blocked (Carrier Org 2122 cannot view Shipper Org 2's portal invoice)
  const crossTenantInvoiceRes = await request({
    hostname: 'localhost',
    port: 8001,
    path: `/v1/portal/invoices/${invoice.id}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenCarrier2122}` },
  });
  assert(crossTenantInvoiceRes.status === 403, `Cross-tenant invoice access rejected with HTTP 403`);

  // Guard 2: Closed shipment cannot transition backwards to draft or booked
  const invalidRollbackRes = await request(
    {
      hostname: 'localhost',
      port: 8001,
      path: `/v1/shipments/${shipmentId}/status`,
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenShipperOrg2}`, 'Content-Type': 'application/json' },
    },
    { status: 'booked', notes: 'Attempt rollback on closed shipment' }
  );
  assert(invalidRollbackRes.status === 400, `Invalid rollback transition on closed shipment rejected with HTTP 400`);

  // Guard 3: Idempotency of invoice generation (calling again does NOT duplicate invoice)
  const invoicesAfterCloseRes = await request({
    hostname: 'localhost',
    port: 8001,
    path: `/v1/portal/invoices?shipment_id=${shipmentId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenShipperOrg2}` },
  });
  const invoicesAfterClose = invoicesAfterCloseRes.body.invoices || invoicesAfterCloseRes.body.data || [];
  assert(invoicesAfterClose.length === 1, `Invoice generation remains strictly idempotent (count: 1)`);

  console.log('\n==================================================================');
  console.log(`WORKFLOW AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
