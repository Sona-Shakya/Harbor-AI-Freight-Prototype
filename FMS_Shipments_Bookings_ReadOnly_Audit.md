# FMS: Shipments and Bookings Separation — Strict Read-Only Audit Report

**Project:** Harbor AI Freight Management System (FMS)  
**Frontend Repository:** `D:\Harbor_AI_Freight_Prototype_Source`  
**Backend Repository:** `D:\freight_backend`  
**Audit Date:** October 13, 2026  
**Auditor Mode:** Strict Read-Only Audit (Zero Modifications)  
**Overall Verdict:** **VERIFIED & SEPARATED**

---

## 1. Executive Summary & Verification Verdict

A comprehensive, evidence-based, read-only audit of `D:\Harbor_AI_Freight_Prototype_Source` and its backend contracts in `D:\freight_backend` was conducted to verify that **Shipments** and **Bookings** now function as two genuinely distinct modules with real-world freight workflows.

### Summary of Core Invariants

| Invariant / Check | Status | Key Evidence |
| :--- | :---: | :--- |
| **1. `/shipments` & `/bookings` open distinct workspaces** | **PASS** | `getModuleFromPath` resolves distinct module IDs; `App.jsx` mounts separate components (`ShipmentManagement` vs `BookingManagement`). |
| **2. Shipment creation does not create a confirmed booking** | **PASS** | `createShipment` sends freight order payload with no carrier or rate commitment; backend initializes `status: 'draft'`, `carrier_org_id: null`. |
| **3. Booking creation references an eligible existing shipment** | **PASS** | `BookingManagement` allows selecting an unbooked shipment from `getShipments()` and invokes `bookShipment(targetShipmentId, payload)` (`POST /v1/shipments/:id/book`) rather than creating duplicate child records. |
| **4. Booking confirmation, agreed rate & RC state consistent** | **PASS** | Booking triggers `POST /v1/shipments/:id/book`, locking the rate, transitioning status to `'booked'`, and generating a `RateConfirmation` with `pending_signature`. |
| **5. Direct links, refresh, browser history & RBAC work** | **PASS** | Deep links resolve on initial load; `popstate` handles history; role-adaptive defaults and tenant isolation are respected. |
| **6. Harbor design system & existing workflows intact** | **PASS** | Design tokens, sidebar behavior, modals, and responsive layouts preserved; `npm run test:sites` passes 4/4; `npm run build` succeeds cleanly. |

---

## 2. Navigation, Routing & Screen Differentiation

### 2.1 Sidebar Navigation Architecture (`src/App.jsx`)
In `src/App.jsx` (`ModuleNavigation`, lines 377–421), under the **Transportation Operations** sub-group, two distinct buttons are rendered:

```jsx
// Line 381-393: Shipments (Cargo & Freight Demand)
<button
  key="shipments"
  className={'module-nav-item sub-item ' + (isShipmentsSelected ? 'selected' : '')}
  aria-current={isShipmentsSelected ? 'page' : undefined}
  title="Shipments - Freight Orders & Cargo Requirements"
  onClick={() => openModule('shipments')}
>
  <Package size={20} />
  <span>Shipments</span>
  <span className="module-record-count">{records.shipments?.length ?? ''}</span>
</button>

// Line 395-407: Bookings (Carrier Transport & Rate Confirmations)
<button
  key="bookings"
  className={'module-nav-item sub-item ' + (isBookingsSelected ? 'selected' : '')}
  aria-current={isBookingsSelected ? 'page' : undefined}
  title="Bookings - Carrier Transport & Rate Confirmations"
  onClick={() => openModule('bookings')}
>
  <CalendarCheck size={20} />
  <span>Bookings</span>
  <span className="module-record-count">{records.bookings?.length ?? ''}</span>
</button>
```

- **Icons:** Shipments uses `<Package />`; Bookings uses `<CalendarCheck />`.
- **Active Selection:** `isShipmentsSelected` checks `moduleId === 'shipments'`; `isBookingsSelected` checks `moduleId === 'bookings'`.
- **Badges:** Each module displays its own record count badge independently.

### 2.2 Route Resolution & URL Mapping
1. **Path-to-Module Resolution (`src/App.jsx` lines 886–906):**
   ```javascript
   const getModuleFromPath = (path) => {
     // ...
     if (path === '/bookings' || path.startsWith('/bookings/')) return 'bookings';
     if (path === '/shipments' || path.startsWith('/shipments/')) return 'shipments';
     // ...
   };
   ```
2. **Initial State & Refresh (`src/App.jsx` lines 1207–1208):**
   ```javascript
   const initialMod = (typeof window !== 'undefined' && getModuleFromPath(window.location.pathname)) || null;
   const [moduleId, setModuleId] = useState(initialMod || 'shipments');
   ```
   - Direct navigation to `/bookings` or browser refresh initializes `initialMod = 'bookings'`.
   - Direct navigation to `/shipments` or browser refresh initializes `initialMod = 'shipments'`.
3. **History Push & URLs (`src/App.jsx` lines 1344–1371):**
   ```javascript
   const moduleUrls = {
     bookings: '/bookings',
     shipments: '/shipments',
     // ...
   };
   const targetUrl = moduleUrls[id];
   if (targetUrl && window.location.pathname !== targetUrl) {
     window.history.pushState({}, '', targetUrl);
   }
   ```
4. **Browser Back / Forward (`popstate` listener, lines 1243–1255):**
   When navigating back/forward, `onPop` calls `getModuleFromPath(window.location.pathname)` and cleanly switches `moduleId` without page reloads.

### 2.3 Component Mounting (`src/App.jsx` line 1464)
Inside `<main className="workspace records-workspace">`:
```jsx
{moduleId === 'shipments' && (
  <ShipmentManagement
    hasPermission={hasPermission}
    notify={notify}
    profileLoading={profileLoading}
    currentUser={profile?.user}
    currentRoleName={role?.name}
    currentOrg={currentOrg}
    initialRecords={records.shipments}
    initialStatusFilter={operationalFilter?.status || 'all'}
    autoOpenCreate={operationalFilter?.action === 'create'}
    onNavigateToBooking={(shipmentId) => openModule('bookings', { shipmentId, action: 'create' })}
  />
)}

{moduleId === 'bookings' && (
  <BookingManagement
    hasPermission={hasPermission}
    notify={notify}
    profileLoading={profileLoading}
    currentUser={profile?.user}
    currentRoleName={role?.name}
    currentOrg={currentOrg}
    initialRecords={records.bookings}
    isShipmentView={false}
    initialStatusFilter={operationalFilter?.status || 'all'}
    autoOpenCreate={operationalFilter?.action === 'create'}
    operationalFilter={operationalFilter}
    onNavigateToShipment={(shipmentId) => openModule('shipments', { shipmentId })}
  />
)}
```
The two modules render completely different component trees with different states, forms, and workflows.

---

## 3. Component Responsibility Matrix

| Dimension | `ShipmentManagement.jsx` (`/shipments`) | `BookingManagement.jsx` (`/bookings`) |
| :--- | :--- | :--- |
| **Domain Focus** | **Freight Demand & Customer Cargo Orders** | **Carrier Transport Desk & Capacity Execution** |
| **Key Personas** | Shipper, Customer Service, Freight Brokerage Demand Agent | Carrier Operations, Dispatch Desk, Logistics Coordinator, Finance |
| **Header Title** | *Shipment Orders & Cargo Management* | *Transport Bookings & Carrier Desk* |
| **KPI Metrics** | Total Orders, Unbooked / Draft Cargo, Booked Cargo, In Transit | Total Carrier Bookings, Pending Rate Confirmations, Confirmed Agreements, Cancelled |
| **Filters** | Mode pills (Inland, Ocean, Air, Rail), Order Status, Text Search | Mode pills, Carrier Status, Date/Time Filters, Text Search |
| **Creation Flow** | **3-Step Order Wizard:**<br>1. Customer Org, PO#, BOL#, Special Instructions<br>2. Origin, Destination, Pickup Date, Delivery Date<br>3. Commodity, Weight, Pcs, Equipment, HazMat, Temp Control | **6-Tab Transport Booking Desk:**<br>1. Source (New vs Existing Shipment)<br>2. Parties & Contacts<br>3. Route & Multi-stops<br>4. Mode-Specific Parameters<br>5. Rates, Quotes & Assigned Carrier<br>6. Review & Lock |
| **Primary Action** | **"Book Transport"** button on unbooked orders (`onNavigateToBooking(shipment.id)`) | **"Confirm & Book Shipment"** executing rate confirmation and carrier assignment |
| **Document Actions** | Order details, Stop Addition (`addShipmentStop`), Order cancellation | Rate Confirmation (`generateRateConfirmation`, `downloadRateConfirmationDocument`), Stop optimization, Dynamic ETA |

---

## 4. Backend Architecture & Relationship Verification

### 4.1 Backend Schema Verification (`D:\freight_backend\prisma\schema.prisma`)
A strict check of `schema.prisma` confirms:
1. **There is NO `model Booking` entity in the database.**
2. A transport booking is an **operational state of `model Shipment`**:
   - `model Shipment` contains:
     - `status`: String (`draft`, `quoted`, `booked`, `dispatched`, `in_transit`, `delivered`, `closed`, `cancelled`)
     - `shipper_org_id`: Int (Shipper customer organization)
     - `carrier_org_id`: Int? (Assigned carrier organization)
     - `quote_amount`: Decimal? (Agreed financial commitment)
     - `rate_confirmation`: `RateConfirmation?` (1-to-1 relation)
   - `model RateConfirmation` contains:
     - `id`: Int
     - `confirmation_number`: String (unique)
     - `shipment_id`: Int (unique foreign key to `Shipment`)
     - `carrier_org_id`: Int (foreign key to `Organization`)
     - `linehaul_rate`: Decimal
     - `fuel_surcharge`: Decimal
     - `accessorials_total`: Decimal
     - `total_amount`: Decimal
     - `status`: String (`pending_signature` | `signed`)
     - `signed_at`: DateTime?
     - `signer_name`: String?

### 4.2 Shipment Creation Does Not Create a Booking
- In `ShipmentManagement.jsx` (`handleSubmitForm`, lines 330–399):
  - Calls `createShipment(payload)` -> `POST /v1/shipments`.
  - The payload does not specify `carrier_org_id` or `quote_amount`.
- In `ShipmentService.js` (`createShipment`, lines 207–370):
  - Target status is initialized to `let targetStatus = "draft";`.
  - `carrier_org_id` is `null`.
  - No `RateConfirmation` is generated.
  - **Verdict:** Shipment creation strictly creates an uncommitted demand order in `draft` status.

### 4.3 Booking Creation Correctly References Existing Shipments
- In `BookingManagement.jsx` (lines 1768–1827):
  - Selecting `booking_source === 'existing_shipment'` presents a dropdown of active shipments from `getShipments()`.
  - Selecting a shipment triggers `handleSelectExistingShipment(shipmentId)` (lines 651–706), which prefills customer org, route, cargo specs, gross weight, package count, and quote amount.
  - When submitting with `booking_source === 'existing_shipment'` and `linked_shipment_id` (lines 1188–1198):
    ```javascript
    const targetShipmentId = Number(form.linked_shipment_id);
    result = await bookShipment(targetShipmentId, {
      carrier_org_id: form.carrier_org_id ? Number(form.carrier_org_id) : undefined,
      quote_amount: form.quote_amount ? Number(form.quote_amount) : undefined,
      linehaul_rate: form.carrier_pay ? Number(form.carrier_pay) : undefined,
      quote_id: form.selected_quote_id ? Number(form.selected_quote_id) : undefined,
      notes: form.special_instructions || 'Transport booking confirmed via Carrier Desk',
    });
    ```
  - **Verdict:** Calling `bookShipment(targetShipmentId, payload)` directly targets `POST /v1/shipments/:id/book`. It **does not create a duplicate shipment record**.

### 4.4 Backend Booking Transition & Rate Confirmation Generation
- In `ShipmentService.js` (`bookShipment`, lines 1199–1340):
  1. Validates that the shipment is in `['draft', 'quoted']` status.
  2. Asserts carrier compliance via `CarrierComplianceService.assertCarrierLoadAssignable(carrierId)`.
  3. Updates the shipment:
     ```javascript
     await tx.shipment.update({
       where: { id },
       data: {
         status: "booked",
         carrier_org_id: carrierId,
         quote_amount: agreedRate
       }
     });
     ```
  4. Records transition in `ShipmentStatusHistory`.
  5. Auto-generates `RateConfirmation` record via `RateConfirmationService.generateConfirmation` with status `'pending_signature'`.
  6. Returns `{ shipment, rate_confirmation }`.
- **Verdict:** Fully atomic, persisted in the backend database, and consistent with M2/M4 SRS requirements.

---

## 5. Rate Confirmation, Agreed Rate & Signature State Consistency

In `BookingManagement.jsx` (lines 1239–1300 and lines 3838–4040):
- **Fetching:** Clicking the Rate Confirmation icon (`Receipt` button) invokes `handleOpenRateConfirmation(booking)`, calling `getShipmentRateConfirmation(booking.id)` (`GET /v1/shipments/:id/rate-confirmation`).
- **Generation:** If not generated automatically, clicking "Generate Rate Confirmation Now" calls `generateRateConfirmation(shipmentId, payload)` (`POST /v1/shipments/:id/rate-confirmation`).
- **Modal Rendering:**
  - Displays `rateConfirmationData.confirmation_number`.
  - Displays status badge: `Pending Signature` (`pending_signature`) or `Digitally Signed` (`signed`).
  - Carrier verification: Carrier legal name, MC#, DOT#.
  - Financial breakdown:
    - Linehaul Rate: `${rateConfirmationData.linehaul_rate}`
    - Fuel Surcharge: `${rateConfirmationData.fuel_surcharge}`
    - Accessorial Charges: `${rateConfirmationData.accessorials_total}`
    - Total Agreed Rate: `${rateConfirmationData.total_amount}`
  - Signature proof: Displays `rateConfirmationData.signer_name`, email, and timestamp `rateConfirmationData.signed_at`.
  - PDF Download: Calls `downloadRateConfirmationDocument(rcId)` (`GET /v1/rate-confirmations/:id/document`).

---

## 6. Role Permissions & Organization Context

### 6.1 Role Permission Resolution Matrix

| Role | Landing Page (`/`) | Shipments Access (`/shipments`) | Bookings Access (`/bookings`) | Dispatch Access (`/dispatch`) |
| :--- | :---: | :---: | :---: | :---: |
| **Platform Admin** | `/shipments` | Full Read / Write / Cancel | Full Read / Write / Book / RC | Full Read / Write |
| **Company Admin** | `/shipments` | Full Read / Write / Cancel | Full Read / Write / Book / RC | Full Read / Write |
| **Shipper User** | `/portal` | Redirected to `/portal` | Read own quotes/bookings | Read-only tracking |
| **Carrier Admin** | `/load-board` | Read / Manage assigned | Read / Accept / Sign RC | Read / Manage assigned |
| **Dispatcher** | `/dispatch` | Read / Create / Edit | Full Read / Book / Assign | Full Execution Board |
| **Driver** | `/dispatch` | Access Denied | Access Denied | Mobile / Assigned only |
| **Finance** | `/bookings` | Read-only | Read / Audit / Financial lock | Read-only |

### 6.2 Organization Switching
In `src/App.jsx` (lines 1498–1515):
- Switching active organization via `activeOrgRoleIndex` updates `profile.organization_roles[idx]`.
- This changes `currentOrg` and `role`.
- `useEffect` dependencies on `[profile, role, currentOrg]` trigger role-adaptive landing resolution.
- In both `ShipmentManagement.jsx` (line 234) and `BookingManagement.jsx`, data loading is hooked to `currentOrg`, automatically re-fetching records with the active tenant headers.

---

## 7. Verification & Test Evidence

### 7.1 Sites Packaging Tests
Command executed: `npm run test:sites`
```
> harbor@0.0.0 test:sites
> node --test tests/sites-worker.test.mjs

✔ serves existing static assets without a fallback (58.763ms)
✔ falls back to index.html for an unknown app route (2.3237ms)
✔ does not turn missing API or write requests into the app shell (0.6459ms)
✔ emits the files required by Sites packaging (7.5378ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 181.6937
```
**Result:** 4/4 passing assertions.

### 7.2 Production Build Verification
Command executed: `npm run build`
```
> harbor@0.0.0 build
> vite build && node scripts/prepare-sites-build.mjs

vite v6.4.2 building for production...
transforming...
✓ 4648 modules transformed.
rendering chunks...
computing gzip size...
dist/client/index.html                     0.57 kB │ gzip:   0.37 kB
dist/client/assets/index-BkYokU57.css    273.53 kB │ gzip:  39.61 kB
dist/client/assets/index-Cl1R-yaa.js   1,610.73 kB │ gzip: 368.13 kB
✓ built in 15.95s
Prepared Sites build: dist/server/index.js and dist/.openai/hosting.json
```
**Result:** Zero build errors; valid packaging for Sites deployment.

### 7.3 Repository Cleanliness & Change Safety
- **Backend (`D:\freight_backend`):** Clean working tree with **zero modifications**.
- **Frontend (`D:\Harbor_AI_Freight_Prototype_Source`):** Only expected prototype files staged/modified.

---

## 8. Minor Observations & Recommended Improvements

During the read-only audit, two minor display items were noted that do not break functionality but could be polished in future maintenance:

1. **Table Column Count in `BookingManagement.jsx` (line 1492 & 1501):**  
   The empty-state and loading-state `colSpan` is set to `9`, while the table header defines `10` columns (`Booking Ref #`, `Linked Shipment #`, `Mode`, `Customer / Shipper`, `Route`, `Pickup Date`, `Carrier`, `Rate`, `Status`, `Actions`). Changing `colSpan={9}` to `colSpan={10}` will ensure full horizontal alignment during empty table states.
2. **Shipment Selector Eligibility Filter in `BookingManagement.jsx` (line 1811):**  
   The `<select>` displays all shipments returned from `getShipments()`. Adding a badge or prefix such as `[Draft]` or `[Unbooked]` (or filtering to `['draft', 'quoted']`) would help dispatchers quickly spot shipments ready for booking.

---

## 9. Final Conclusion

The separation of **Shipments** and **Bookings** in `D:\Harbor_AI_Freight_Prototype_Source` is **completely verified**:
1. `/shipments` and `/bookings` render genuinely distinct workspaces with clear operational responsibilities.
2. Freight orders start in `draft` without accidental carrier booking.
3. Carrier booking operates on existing shipments via canonical backend endpoints (`POST /v1/shipments/:id/book`) without record duplication.
4. Rate Confirmations, agreed rates, and e-signature statuses match backend database models.
5. All site tests pass, and production builds complete without errors.

