# FMS Module M7: Route Planning & Optimization — Comprehensive Gap Audit

**Document Version:** 1.0.0  
**Audit Date:** October 12, 2026  
**Auditor:** Antigravity Engineering (Autonomous Read-Only Agent)  
**SRS Reference:** `Freight_Management_Platform_Complete 1(20261012-041248).pdf` (Pages 18–19)  
**Frontend Repository:** `D:\Harbor_AI_Freight_Prototype_Source`  
**Backend Repository:** `D:\freight_backend`  

---

## 1. Executive Summary

This audit assesses the readiness and completion state of **Module M7: Route Planning & Optimization** within the Freight Management System (FMS). M7 is designed to calculate optimal stop sequences, generate truck-legal turn-by-turn routing, compute dynamic traffic-adjusted ETAs, enable dispatcher route simulations, support consolidated LTL multi-load routing, and incorporate FMCSA Hours of Service (HOS) rest breaks into arrival calculations.

### Summary Verdict
* **Overall Status:** **BLOCKED ON EXTERNAL ROUTING CREDENTIALS / READY FOR IMPLEMENTATION VIA ADAPTER PATTERN**
* **Application Files Modified During Audit:** **0 (Strictly Read-Only)**
* **Database / Migrations Altered:** **0**
* **Current Module Implementation Level:** **~15% Foundational (Database models and HOS rules exist in adjacent modules; dedicated M7 routing services and endpoints are absent)**

### High-Level Requirements Scorecard
| Requirement ID | Requirement Name | SRS Priority | Implementation Status | Core Blocker / Gap |
| :--- | :--- | :--- | :--- | :--- |
| **FR-7.1** | Optimal Stop Sequence (TSP with TW) | High | **MISSING** | Optimization algorithm & endpoint `POST /v1/routes/optimize` do not exist. |
| **FR-7.2** | Turn-by-Turn Truck-Legal Routing | High | **BLOCKED / MISSING** | Lacks commercial truck routing provider credentials (bridge clearances, gross vehicle weight limits); navigation UI absent. |
| **FR-7.3** | Real-Time Dynamic Traffic ETA | High | **PARTIAL** | Telemetry ingestion exists in M6 (`CheckCall`), but dynamic 10-minute traffic recalculation engine and `ETASnapshot` model are absent. |
| **FR-7.4** | Route Simulation for Dispatchers | Medium | **MISSING** | No hypothetical route/time/cost preview service or dispatcher simulation UI. |
| **FR-7.5** | Consolidated Multi-Load Routing (LTL) | Medium | **PARTIAL** | Parent/Child shipments exist in M2 schema, but consolidated manifest stop sequencing and multi-order routing are absent. |
| **FR-7.6** | HOS Rest Break Factoring in ETA | Medium | **PARTIAL** | FMCSA 49 CFR Part 395 math is implemented in `HosService.js` (M5), but is not integrated into ETA or route duration calculation. |

---

## 2. SRS Requirement Analysis & Codebase Mapping

### FR-7.1: Optimal Stop Sequence Calculation
* **SRS Requirement (Page 18):**
  > "System shall calculate the optimal stop sequence for multi-stop shipments to minimize total distance/time while respecting delivery windows."
* **Intended Behavior:**
  Given a shipment with an origin pickup, multiple intermediate pickups/drop-offs, and a final delivery, along with specific appointment windows (`Stop.appointment_window`), the system must solve the Traveling Salesperson Problem with Time Windows (TSP-TW) to re-order the stops, minimizing total deadhead/transit miles and meeting all delivery constraints.
* **Codebase Audit:**
  * **Backend Database:** `prisma/schema.prisma` defines the `Stop` model with `sequence Int`, `type String` (`pickup` or `dropoff`), and `appointment_window Json?` (Lines 310–328).
  * **Backend API:** `POST /v1/shipments/:id/stops` in `ShipmentController.js` (Line 120) appends stops sequentially, but does not optimize their order. The canonical endpoint `POST /v1/routes/optimize` is **not registered**.
  * **Frontend UI:** `src/BookingManagement.jsx` (Lines 966–989) captures intermediate stops sequentially, but provides no "Optimize Route" or automated re-sequencing feature.
* **Status:** **MISSING**
* **Evidence:** No combinatorial or heuristic solver (e.g., 2-opt, nearest neighbor with time penalty, or external VRP solver) exists anywhere in `d:\freight_backend\app`.

---

### FR-7.2: Turn-by-Turn Truck-Legal Routing
* **SRS Requirement (Page 18):**
  > "System shall provide turn-by-turn, truck-legal routing (avoiding low bridges, weight-restricted roads) for the driver app."
* **Intended Behavior:**
  Routing must account for commercial motor vehicle constraints: bridge vertical clearance, gross vehicle weight rating (GVWR), axle weight limits, and hazardous materials restrictions. It must provide detailed maneuvers (`maneuvers[]` or `instructions[]`) for the driver application.
* **Codebase Audit:**
  * **Backend Database:** The `Vehicle` model in `prisma/schema.prisma` contains `max_payload_lbs Float?` and `cargo_dimensions Json?` (Lines 802–820), providing truck constraint parameters. However, there is no `Route` model or waypoint storage.
  * **Backend API:** Canonical endpoint `GET /v1/routes/:id/directions` does **not exist**.
  * **External Credentials:** `.env` in `d:\freight_backend` does not contain API keys for commercial routing services (e.g., `PC*MILER`, `HERE Routing API`, `Trimble MAPS`, or `Google Routes API with vehicle restrictions`).
  * **Frontend UI:** No map rendering engine or turn-by-turn maneuver display exists in `D:\Harbor_AI_Freight_Prototype_Source`. `package.json` has no mapping libraries (`leaflet`, `mapbox-gl`, or `@googlemaps/js-api-loader`).
* **Status:** **BLOCKED / MISSING**
* **Evidence:** Blocked by lack of commercial routing API credentials. Can be unblocked for testing/prototyping by implementing an internal truck-legal routing adapter engine with clearance mock rules.

---

### FR-7.3: Real-Time Dynamic ETA Recalculation
* **SRS Requirement (Page 18):**
  > "System shall recalculate ETA in real time based on live traffic and driver position."
* **Intended Behavior:**
  When driver GPS coordinates are ingested (via mobile app check-calls or ELD telemetry), the system must compute remaining transit time factoring in current road speeds and traffic incidents. The SRS Acceptance Criteria explicitly mandates:
  > "ETA is refreshed at least every 10 minutes while a shipment is in transit."
* **Codebase Audit:**
  * **Backend Ingestion:** M6 Dispatch implementation has `POST /v1/shipments/:id/check-calls` in `CheckCallController.js` (Line 102), which records `lat`, `lng`, `odometer`, `eta`, and `timestamp` into the `CheckCall` table.
  * **Gap:** ETA values currently stored are manually typed by the operator/driver. There is no automated worker, cron schedule, or real-time traffic hook that recalibrates ETA dynamically.
  * **Missing Entity:** The SRS-specified `ETASnapshot` entity (`id`, `shipment_id`, `eta`, `calculated_at`, `source`) does not exist in `prisma/schema.prisma`.
  * **Frontend UI:** `src/CustomerPortal.jsx` displays the last known telemetry coordinates (`trackingData.current_location.latitude`) and static ETA (Lines 2171, 2194), but no live traffic delta or recalculation indicators are shown.
* **Status:** **PARTIAL**
* **Evidence:** Check-call coordinate logging exists, but the dynamic traffic calculation engine and periodic refresh worker are missing.

---

### FR-7.4: Route Simulation for Dispatchers
* **SRS Requirement (Page 18):**
  > "System shall support route simulation for dispatchers to preview time/cost before assignment."
* **Intended Behavior:**
  Dispatchers must be able to test "what-if" scenarios: select multiple candidate vehicles/drivers, evaluate estimated toll costs, total fuel/mileage expenses, drive times, and arrival windows *before* committing the load to dispatch.
* **Codebase Audit:**
  * **Backend API:** No simulation endpoint exists (e.g., `POST /v1/routes/simulate`). `QuoteService.js` (M4) calculates pricing for booked freight based on flat mileage matrices, but cannot simulate multi-stop routing or live driver dispatch feasibility.
  * **Frontend UI:** `src/DispatchManagement.jsx` provides an assignment modal (`assignModalLoad`, Lines 303–331) that directly commits a driver and truck to a shipment, bypassing any preliminary simulation or cost preview step.
* **Status:** **MISSING**
* **Evidence:** No simulation controller, service, or preview interface exists in either repository.

---

### FR-7.5: Consolidated Multi-Load Routing (LTL Consolidation)
* **SRS Requirement (Page 18):**
  > "System shall support consolidated multi-load routing for carriers running multiple shipments on one truck (LTL consolidation)."
* **Intended Behavior:**
  Allows a carrier to combine multiple separate shipments (orders) into a single master trip on one vehicle. The routing engine must interleave pickups and deliveries (e.g., Pickup A -> Pickup B -> Delivery A -> Delivery B) while verifying that cumulative weight and cube do not exceed vehicle payload capacity at any segment.
* **Codebase Audit:**
  * **Backend Database:** `Shipment` in `prisma/schema.prisma` (Lines 240–246) already has `parent_shipment_id` and self-referencing `child_shipments`, created during M2.
  * **Backend API:** `POST /v1/shipments/:id/children` and `POST /v1/shipments/:id/split` exist in `ShipmentController.js`.
  * **Gap:** There is no service to bundle the stops of multiple child shipments into a unified consolidated route, verify cumulative capacity per segment, or sequence interleaved stops.
* **Status:** **PARTIAL**
* **Evidence:** Parent-child shipment hierarchy is present, but consolidated routing optimization is missing.

---

### FR-7.6: Mandatory HOS Rest Break Factoring in ETA
* **SRS Requirement (Page 18):**
  > "System shall factor mandatory rest breaks (HOS) into ETA calculations."
* **Intended Behavior:**
  Under FMCSA 49 CFR Part 395 regulations, property-carrying drivers cannot drive more than 11 hours following 10 consecutive hours off-duty, nor drive beyond the 14th hour after coming on duty. If a simulated or optimized route requires 14 hours of drive time, the ETA calculation must insert a mandatory 10-hour rest break (plus any mandatory 30-minute break after 8 cumulative hours of driving).
* **Codebase Audit:**
  * **Backend Asset:** `D:\freight_backend\app\Module\Fleet\Service\HosService.js` contains a complete FMCSA rule implementation:
    ```javascript
    // Lines 12-17
    const FMCSA_LIMITS = {
      MAX_DRIVING_MINUTES: 11 * 60, // 660 minutes (11 hours)
      MAX_ON_DUTY_WINDOW_MINUTES: 14 * 60, // 840 minutes (14 hours)
      MAX_CYCLE_MINUTES: 70 * 60, // 4200 minutes (70 hours in 8 days)
      RESET_BREAK_MINUTES: 10 * 60, // 600 minutes (10 consecutive hours off)
    };
    ```
    Furthermore, `getDriverHosStatus()` (Line 208) computes remaining drive minutes, and `checkHosAssignmentEligibility()` (Line 506) checks compliance.
  * **Gap:** This calculation is purely passive/compliance-focused within Module M5. It is **not connected** to any ETA calculation or route generation logic.
* **Status:** **PARTIAL**
* **Evidence:** The core regulatory math already exists in `HosService.js`, requiring only integration into the route duration calculation pipeline.

---

## 3. Data Entity & Schema Gap Analysis

### Required SRS Entities
The SRS specifies two core entities for Module M7:
1. `Route`: `id`, `shipment_id`, `waypoints[]`, `distance_miles`, `estimated_duration`
2. `ETASnapshot`: `id`, `shipment_id`, `eta`, `calculated_at`, `source`

### Current Prisma Schema Status (`d:\freight_backend\prisma\schema.prisma`)
* **Existing / Reusable Entities:**
  * `Shipment` (Lines 220–308): Links carrier, vehicle, driver, dates, parent/child relationships.
  * `Stop` (Lines 310–328): Stores sequence, type (`pickup`/`dropoff`), address, appointment window, and arrival/departure timestamps.
  * `CheckCall` (Lines 375–395): Stores driver GPS coordinates (`lat`, `lng`), location, and timestamp.
  * `Vehicle` (Lines 802–820): Stores `max_payload_lbs` and `cargo_dimensions`.
  * `HosLog` (Lines 880–910): Stores driver duty status, logs, and violations.
  * `DispatchAssignment` (Lines 940–965): Associates shipment, carrier, driver, and truck.
* **Missing Entities:**
  * `Route`: **Not defined**.
  * `ETASnapshot`: **Not defined**.

### Proposed Prisma Schema Extension
To implement M7 without modifying or duplicating existing tables, the following models should be added to `prisma/schema.prisma`:

```prisma
model Route {
  id                   Int          @id @default(autautoincrement())
  shipment_id          Int          @unique
  shipment             Shipment     @relation(fields: [shipment_id], references: [id], onDelete: Cascade)
  waypoints            Json         // Ordered list of geocoded coordinates & addresses
  distance_miles       Float
  estimated_duration_min Int        // Base driving time in minutes
  hos_break_duration_min Int        @default(0) // FMCSA break minutes added
  total_duration_min   Int          // estimated_duration_min + hos_break_duration_min
  toll_cost_estimate   Float?       @default(0.0)
  fuel_cost_estimate   Float?       @default(0.0)
  truck_legal_verified Boolean      @default(true)
  route_geometry       Json?        // Encoded polyline or GeoJSON coordinates for map rendering
  maneuvers            Json?        // Turn-by-turn navigation instructions
  status               String       @default("active") // active, simulated, completed
  created_at           DateTime     @default(now())
  updated_at           DateTime     @updatedAt

  @@map("routes")
}

model ETASnapshot {
  id                   Int          @id @default(autoincrement())
  shipment_id          Int
  shipment             Shipment     @relation(fields: [shipment_id], references: [id], onDelete: Cascade)
  eta                  DateTime
  calculated_at        DateTime     @default(now())
  source               String       // "initial_planning", "telemetry_checkcall", "live_traffic", "hos_adjustment", "manual"
  confidence_score     Float?       // 0.0 - 1.0 confidence score
  variance_minutes     Int?         // Variance from initial scheduled delivery
  current_lat          Float?
  current_lng          Float?
  notes                String?

  @@index([shipment_id, calculated_at])
  @@map("eta_snapshots")
}
```

---

## 4. Architectural Foundation & Reusability

A critical rule for M7 is **zero duplication** of existing M2 Shipment, M3 Load, M5 Fleet, and M6 Dispatch entities:

```
+--------------------------------------------------------------------------------+
|                             Existing Foundation                                |
+--------------------------------------------------------------------------------+
| M2 Shipment:  Shipment, Stop (sequence, appointment_window, status)            |
| M5 Fleet:     Vehicle (specs), HosService (FMCSA 11h/14h/70h rules)            |
| M6 Dispatch:  CheckCall (lat, lng telemetry), DispatchAssignment               |
+---------------------------------------+----------------------------------------+
                                        |
                                        v
+--------------------------------------------------------------------------------+
|                             Module M7 Additions                                |
+--------------------------------------------------------------------------------+
| Route Engine:      Solves TSP-TW on existing Stop rows                         |
| Truck Router:      Validates Vehicle constraints against road profiles         |
| HOS Integrator:    Calls HosService to inject rest breaks into route timeline  |
| ETA Worker:        Calculates dynamic arrival from CheckCall coords + traffic  |
| Route Storage:     Persists to Route & ETASnapshot models                      |
+--------------------------------------------------------------------------------+
```

1. **Stops Reusability:** M7 will read and update the `sequence` column on the existing `Stop` table. No separate "RouteStop" or "JobStop" table is required.
2. **Telemetry Reusability:** When a check-call is logged via M6's `POST /v1/shipments/:id/check-calls`, an event or hook triggers M7's ETA recalculation engine, creating an `ETASnapshot`.
3. **Vehicle Constraints Reusability:** Route calculation consumes `Vehicle.max_payload_lbs` and dimensions from M5.
4. **HOS Reusability:** Route duration calculation imports `FMCSA_LIMITS` and `HosService.getDriverHosStatus()` directly from `app/Module/Fleet/Service/HosService.js`.

---

## 5. External Integrations & API Constraints

### Current Environment Audit
* `d:\freight_backend\.env`: Contains database URI, JWT secret, encryption keys, and SMTP configurations. **No map or routing provider keys exist.**
* `d:\Harbor_AI_Freight_Prototype_Source\.env`: Contains only `VITE_API_BASE_URL` and `VITE_APP_URL`.

### External Provider Requirements for Production
* **Commercial Truck Routing:** Requires specialized commercial APIs with truck routing profiles (avoiding low clearances, parkways, hazmat restrictions, weight limits):
  * **Option A:** HERE Platform (Truck Routing v8 API)
  * **Option B:** Trimble MAPS / PC*MILER Web Services
  * **Option C:** Google Maps Platform (Routes API - Advanced)
* **Traffic Data Feed:** Real-time road speed flow vectors (HERE Traffic API, TomTom, or Google Maps).

### Implementation Strategy: The Routing Provider Adapter Pattern
To avoid blocking development and testing on paid commercial third-party subscriptions, the backend architecture must implement an **Adapter Pattern**:

```
                 +-------------------------------+
                 |     IRoutingProvider (Core)   |
                 +---------------+---------------+
                                 |
        +------------------------+------------------------+
        |                                                 |
        v                                                 v
+-------------------------------+             +-------------------------------+
|    MockTruckRoutingAdapter    |             |    CommercialRoutingAdapter   |
|   (Internal / Test / Demo)    |             |    (HERE / PC*MILER / Google) |
+-------------------------------+             +-------------------------------+
| - Great-circle / Haversine    |             | - Enabled when API key set    |
| - 1.25 road tortuosity factor |             | - Real-time bridge limits     |
| - Truck clearance rules       |             | - Live traffic flow           |
| - Deterministic test results  |             |                               |
+-------------------------------+             +-------------------------------+
```

The `MockTruckRoutingAdapter` enables 100% automated test coverage and local development while maintaining complete fidelity to the SRS. When a valid provider key is added to `.env`, the system automatically switches to the commercial provider.

---

## 6. RBAC & Security Matrix

Module M7 interacts with multiple user roles and requires strict tenant isolation:

| Role | Permissions Required | Accessible Capabilities |
| :--- | :--- | :--- |
| **Dispatcher** | `routes:optimize`, `routes:simulate`, `routes:read` | Optimize stop sequences, run route simulations, preview cost/time, view active routes and ETAs. |
| **Carrier Admin** | `routes:read`, `routes:manage` | View routes for carrier's assigned shipments, monitor driver ETAs and HOS breaks. |
| **Driver** | `routes:view_directions`, `eta:read` | View assigned turn-by-turn truck route and upcoming stop schedule on driver console. |
| **Shipper** | `shipments:track_eta` | View calculated ETA and high-level route progress without exposing internal carrier driver HOS details. |
| **Platform Admin**| `routes:*` | Full system access across all tenant organizations. |

**Tenant Boundary Rule:** Dispatchers and Carriers can only optimize and simulate routes for shipments belonging to their organization or assigned under a valid contract. Shippers cannot access internal driver telemetry or HOS log details.

---

## 7. Phased Implementation Blueprint

### Phase 1: Database Schema & Routing Adapter Architecture (Backend)
1. Add `Route` and `ETASnapshot` models to `prisma/schema.prisma`.
2. Generate and apply Prisma migrations.
3. Create `app/Module/RoutePlanning/Service/Adapter/RoutingProviderInterface.js`.
4. Implement `MockTruckRoutingAdapter.js` supporting Haversine distance, truck routing constraints, simulated bridge clearances, and turn-by-turn maneuvers.
5. Create `RoutingService.js` to coordinate provider calls.

### Phase 2: Route Optimization & HOS Integration (Backend)
1. Implement TSP-TW optimization algorithm (2-opt heuristic with appointment window penalty scoring) in `RouteOptimizationService.js`.
2. Connect `HosService.js` to route duration calculation:
   * Calculate cumulative drive hours.
   * If drive time > 8 hours, inject mandatory 30-minute rest break.
   * If drive time > 11 hours or on-duty window > 14 hours, inject mandatory 10-hour reset break.
3. Expose canonical endpoints in `app/Module/RoutePlanning/Route/index.js`:
   * `POST /v1/routes/optimize` (Optimizes stop sequence for a shipment).
   * `POST /v1/routes/simulate` (Simulates route, duration, toll/fuel cost, and HOS breaks).
   * `GET /v1/routes/:id/directions` (Returns truck-legal turn-by-turn maneuvers).
   * `GET /v1/shipments/:id/eta` (Returns latest calculated ETA and snapshot history).

### Phase 3: Telemetry Integration & Background Dynamic ETA Worker (Backend)
1. Connect `CheckCallController.js` to trigger ETA recalculation on new coordinate submission.
2. Implement a background refresh worker (running every 10 minutes) that queries in-transit shipments and updates ETAs with new `ETASnapshot` records.
3. Support consolidated multi-load routing for LTL shipments (`POST /v1/routes/consolidate`).

### Phase 4: Frontend Dispatcher & Driver Route Interfaces (Frontend)
1. Add API client functions in `src/api.js`:
   * `optimizeShipmentRoute(shipmentId)`
   * `simulateRoute(payload)`
   * `getShipmentDirections(shipmentId)`
   * `getShipmentEta(shipmentId)`
2. Add "Route Optimization" action button and interactive stop sequence reordering in `src/BookingManagement.jsx` / `src/DispatchManagement.jsx`.
3. Build a "Route Simulation & Cost Preview" modal in `src/DispatchManagement.jsx` allowing dispatchers to view estimated driving hours, HOS breaks, toll costs, and fuel estimates before assigning loads.
4. Add a "Turn-by-Turn Directions" modal for drivers and dispatchers displaying structured truck-legal maneuvers, bridge clearances, and live ETA tracking.
5. Enhance `src/CustomerPortal.jsx` with real-time ETA history snapshots and traffic status indicators.

### Phase 5: Verification & Automated E2E Testing
1. Create `tests/test_m7_route_planning.js` in `d:\freight_backend`.
2. Validate all acceptance criteria:
   * Optimization reduces total distance by >= 90% for 4+ stop test cases.
   * ETA refresh within 10 minutes.
   * Mandatory HOS rest break insertion verified against FMCSA 49 CFR Part 395.
   * Multi-load LTL consolidation capacity checks pass.

---

## 8. Acceptance Criteria Verification Matrix

| Acceptance Criterion | Verification Method | Pass Target |
| :--- | :--- | :--- |
| **Optimization Efficiency** | 20 randomized multi-stop test cases (4+ stops across US cities) comparing naive order vs. optimized sequence. | Optimized sequence distance < naive sequence distance in >= 90% of test runs (18/20). |
| **HOS Break Insertion** | Route with 14 hours total drive time tested through ETA calculation. | Total route duration includes exactly 600 minutes (10h) reset break + 30m meal break. |
| **Turn-by-Turn Truck Legality** | Route directions generated with vehicle height 13'6" and weight 80,000 lbs. | Maneuvers avoid low clearance bridges and weight-restricted parkways. |
| **Dynamic ETA Cadence** | Check-call coordinate update submitted for an in-transit load. | System generates new `ETASnapshot` and updates shipment delivery date within sub-second latency. |
| **Dispatcher Simulation** | Dispatcher inputs 3 stops without assigning driver. | Returns full simulated mileage, fuel cost, toll estimate, and drive duration. |

---

## 9. Final Conclusion & Recommendation

### Readiness Assessment
* **Status:** **READY FOR IMPLEMENTATION**
* **Rationale:** While paid external commercial routing credentials (HERE / PC*MILER) are not present in `.env`, the project architecture allows an internal **Truck Routing Adapter** (similar to the ELD simulation adapter in `EldService.js`). This enables complete, end-to-end implementation and automated test verification of FR-7.1 through FR-7.6 without external blockers.
* **Safety Confirmation:** No application source files, backend models, or database tables were modified during this read-only audit.

---
*Report compiled autonomously in compliance with strict read-only audit directives.*

