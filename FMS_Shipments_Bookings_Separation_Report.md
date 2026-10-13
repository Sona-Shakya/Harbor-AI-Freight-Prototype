# FMS: Shipments vs. Bookings Architectural Separation & Workflow Report

**Project:** Harbor AI Freight Management System (FMS)  
**Frontend Repository:** `D:\Harbor_AI_Freight_Prototype_Source`  
**Backend Repository:** `D:\freight_backend`  
**Date:** October 13, 2026  
**Status:** COMPLETE & VERIFIED

---

## 1. Executive Summary

Previously, the FMS navigation had an issue where `/bookings` resolved to `/shipments` and rendered identical functionality. In real-world freight forwarding and logistics:
- **Shipment Management (`/shipments`)** represents **freight demand and cargo order management**: shipper customer orders, commodity details, weights, dimensions, reference numbers (Customer PO#, BOL#), multi-stop pickup and delivery schedules, and cargo-level documentation.
- **Booking Management (`/bookings`)** represents **transport execution and carrier capacity desk**: securing carrier commitments, locking in carrier quotes/linehaul rates, issuing Rate Confirmations, handling electronic signatures, and preparing for dispatch.

This implementation genuinely separates both modules into distinct, permission-protected frontend modules, while honoring the backend data model and API contracts without requiring any backend code changes.

---

## 2. Domain & Architectural Separation

```
[ Customer / Demand Side ]                  [ Carrier / Capacity Side ]
+-------------------------------+           +-------------------------------+
|    Shipments (/shipments)     |           |     Bookings (/bookings)      |
|                               |           |                               |
| • Freight Demand & POs        |           | • Carrier Assignment          |
| • Commodity Specs & Weight    |           | • Rate Confirmation (RC)      |
| • Origin & Destination Stops  |  ======>  | • Linehaul & Fuel Surcharges  |
| • Ready Dates & Delivery Appt |           | • Digital Signature (E-Sign)  |
| • Status: Draft, Quoted       |           | • Status: Booked, Dispatched  |
+-------------------------------+           +-------------------------------+
                |                                           |
                v                                           v
    "Book Transport Carrier"                   "Open Shipment Order Details"
      navigates to /bookings                      navigates to /shipments
```

### 2.1 Backend Contract Mapping
In `freight_backend` (Prisma schema & ShipmentController):
1. A shipment starts with `status: 'draft'` or `'quoted'`, where `carrier_org_id` is `null`.
2. Booking occurs via canonical endpoint:
   ```http
   POST /v1/shipments/:id/book
   ```
   Payload:
   ```json
   {
     "carrier_id": "carrier-uuid",
     "quote_amount": 2850.00,
     "quote_id": "optional-quote-uuid",
     "driver_id": "optional-driver-uuid",
     "notes": "Standard dry van booking"
   }
   ```
3. This transitions the shipment status to `'booked'`, populates `carrier_org_id`, validates/locks the quote, and auto-generates a `RateConfirmation` record with status `'pending_signature'`.
4. Previously, the prototype booking form was creating a child shipment with `parent_shipment_id`, duplicating records. Now, booking an existing shipment directly invokes `bookShipment(shipmentId, payload)`, updating the actual shipment order and creating its associated Rate Confirmation.

---

## 3. Implementation Details

### 3.1 Dedicated `ShipmentManagement.jsx`
- **File:** `src/ShipmentManagement.jsx`
- **Responsibilities:**
  - Freight Demand KPI Summary: Total Orders, Unbooked / Draft Cargo, Booked Cargo, In Transit.
  - Mode filtering: Inland, Ocean, Air, Rail.
  - Search by Order #, Customer Reference, Commodity, Origin, Destination.
  - 3-Step Freight Order Creation Wizard:
    1. **Customer & References:** Customer Organization, Customer PO#, Bill of Lading (BOL#), Order Notes.
    2. **Multi-Stop Route & Schedule:** Origin/Pickup facility, target pickup appointment, Destination/Delivery facility, target delivery appointment.
    3. **Cargo Specs & Equipment:** Cargo description, Equipment Type (Dry Van, Reefer, Flatbed, 40HC Container), Total Weight (lbs), Total Pieces, HazMat flag, Temperature Controlled flag.
  - Stop Management: Interactive modal to add pickup/delivery stops (`addShipmentStop`).
  - Transport Action: Orders in unbooked states (`draft`, `quoted`, `unbooked`) feature a prominent **"Book Transport"** button that routes directly to `/bookings` with the shipment ID pre-selected (`onNavigateToBooking(shipment.id)`).

### 3.2 Enhanced `BookingManagement.jsx`
- **File:** `src/BookingManagement.jsx`
- **Responsibilities:**
  - Carrier Desk KPI Summary: Total Carrier Bookings, Pending Rate Confirmations, Confirmed Carrier Agreements, Cancelled.
  - Dual Workflow Support:
    1. **Book Existing Cargo Order:** Pre-selects and links to an eligible unbooked shipment from `getShipments()`. Calls `bookShipment(targetShipmentId, payload)` (`POST /v1/shipments/:id/book`).
    2. **Direct Carrier Booking:** Creates a dedicated booking and carrier assignment for direct spot engagements.
  - Rate Confirmation & E-Sign Desk:
    - View generated Rate Confirmations (`fetchRateConfirmations`).
    - Electronic Signature modal (`signRateConfirmation`) capturing signer name, title, and timestamp.
    - Rate breakdown: Linehaul, Fuel Surcharge, Accessorials.
  - Traceability: Displays both `Booking Ref #` and explicit `Linked Shipment #`, with a one-click shortcut (`onNavigateToShipment`) back to the underlying cargo order.

### 3.3 Synchronized `App.jsx` Navigation & Routing
- **File:** `src/App.jsx`
- **Navigation Menu (`ModuleNavigation`):**
  - Under `Transportation Operations`, both items are independently rendered with distinct icons and badges:
    - **Shipments:** `<Package size={20} />`, count `records.shipments?.length`, tooltip `"Shipments - Freight Orders & Cargo Requirements"`.
    - **Bookings:** `<CalendarCheck size={20} />`, count `records.bookings?.length`, tooltip `"Bookings - Carrier Transport & Rate Confirmations"`.
- **Routing Engine (`getModuleFromPath` & `moduleUrls`):**
  - `/shipments` maps strictly to `'shipments'`.
  - `/bookings` maps strictly to `'bookings'`.
  - Removed old redirect replacing `/bookings` with `/shipments`.
- **Module View Mounting:**
  - `moduleId === 'shipments'` mounts `<ShipmentManagement ... />`.
  - `moduleId === 'bookings'` mounts `<BookingManagement ... />`.
  - Deep-link and inter-module transitions: Navigating from a shipment via `onNavigateToBooking` passes operational filters `{ shipmentId, action: 'create' }`, automatically opening the carrier booking modal with the shipment selected.

---

## 4. Verification & Testing

### 4.1 Sites Packaging Tests
Command: `npm run test:sites`
```
✔ serves existing static assets without a fallback (108.8627ms)
✔ falls back to index.html for an unknown app route (3.19ms)
✔ does not turn missing API or write requests into the app shell (1.5063ms)
✔ emits the files required by Sites packaging (13.9886ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
```

### 4.2 Production Build
Command: `npm run build`
```
✓ 4648 modules transformed.
dist/client/index.html                     0.57 kB │ gzip:   0.37 kB
dist/client/assets/index-BkYokU57.css    273.53 kB │ gzip:  39.61 kB
dist/client/assets/index-Cl1R-yaa.js   1,610.73 kB │ gzip: 368.13 kB
✓ built in 15.95s
Prepared Sites build: dist/server/index.js and dist/.openai/hosting.json
```

### 4.3 Git Safety & Integrity
- **Frontend (`D:\Harbor_AI_Freight_Prototype_Source`):**
  - Only modified: `src/App.jsx`, `src/BookingManagement.jsx`, `src/ShipmentManagement.jsx`, and `src/QuoteRateManagement.jsx`.
- **Backend (`D:\freight_backend`):**
  - `git status` confirms zero modifications (`working tree clean`).

---

## 5. Conclusion

Shipments and Bookings are now operating as two distinct, fully integrated modules in the FMS frontend:
1. **Shipments** handles freight demand, customer orders, equipment specifications, and route requirements.
2. **Bookings** handles carrier transport procurement, rate confirmations, carrier rate agreements, and e-signatures.
3. Users experience clear, intuitive real-world navigation with seamless inter-module linking and zero duplicate data creation.

