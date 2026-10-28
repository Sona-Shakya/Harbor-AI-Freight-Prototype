# Freight Mode Restriction Report

## Changed files

| File | Changes |
|---|---|
| `src/BookingManagement.jsx` | Mode choices and the booking form header now describe Ocean Freight and Air Cargo. The rate-confirmation dialog defaults missing mode text to Ocean instead of Inland. Legacy saved modes remain readable and are labeled in the booking list as described below. |
| `src/ShipmentManagement.jsx` | Restricts shipment mode choices to Ocean and Air; normalizes unknown and legacy saved modes to a safe legacy state; filters equipment by selected mode; uses a mode-appropriate equipment default; preserves legacy mode text in list rows; updates the lifecycle guide to Ocean/Air wording. |
| `src/CustomerPortal.jsx` | Adds Ocean/Air selection to quote-and-book, supplies only matching container/ULD equipment, and sends a normalized `mode` with quote and booking requests (top-level, and in booking `freight_details`). The shipment-detail equipment fallback no longer implies Dry Van. |
| `src/QuoteRateManagement.jsx` | Clarifies that its FTL/LTL filter and table values are trucking quote service types, not freight transport modes. Freight mode choices and backend quote service behavior are otherwise unchanged. |
| `src/PublicTrackingScreen.jsx` | Replaces the road/rail/port corridor statement with Ocean/Air shipment tracking wording. |

No backend files or API paths were changed. `src/DispatchManagement.jsx` was not changed: it has no freight-mode filter or freight-mode selector. Its `viewMode` is a dispatch presentation view, and its remaining truck/road references describe dispatch operations or a road-conditions placeholder.

## Changed search hits

- Booking form copy that previously listed Inland, Ocean, Air, and Rail now says Ocean Freight or Air Cargo.
- The rate-confirmation dialog's missing-mode fallback changed from Inland to Ocean.
- Shipment mode choices, defaults, filters, list rendering, equipment options, and workflow-guide copy now use the restricted mode set; legacy rows still render safely.
- Customer Portal quote-and-book now has an Ocean/Air selector. Both quote and booking payloads always include `mode: 'ocean'` or `mode: 'air'`; the booking payload also includes that value in `freight_details.mode`.
- The Public Tracking marketing copy no longer lists road and rail corridors.
- Quote-rate labels that called FTL/LTL “modes” now call them “service types.”

## Intentionally retained references

| File(s) | Retained references | Reason |
|---|---|---|
| `src/BookingManagement.jsx` | `road_*` and `rail_*` fields used to read old records; legacy mode recognition; driver instructions mapped to pickup-stop instructions; Ocean Reefer container sizes | Legacy compatibility and operational/container data, not selectable freight modes. The legacy list label and warning behavior are retained. |
| `src/PortMaster.jsx` | Inland port and rail-ramp facility types and related directory copy | These classify physical locations in the port directory; they are not shipment mode choices. |
| `src/CfsMaster.jsx` | Inland container depot (ICD) and rail/intermodal hub facility types | These classify physical CFS/network facilities, not shipment modes. |
| `src/App.jsx`, `src/data.js` | CFS/inland-terminal descriptions; Transport & Delivery's inland movement description and sample providers; transportation/fleet module icons | These describe network locations or trucking/transport operations rather than freight-mode selectors. |
| `src/data.js`, `src/SettingsRegistry.jsx` | The configurable dry-van, reefer, flatbed, step-deck, power-only, and box-truck equipment catalog | This is a shared equipment/settings catalog used by fleet and load-board workflows, not a freight-mode choice. |
| `src/LoadBoard.jsx` | Truck equipment options and truck-related load, carrier, and preference controls | Load-board logic and trucking equipment workflows were explicitly out of scope. |
| `src/CarrierFleetManagement.jsx`, `src/JobManagement.jsx`, `src/DispatchManagement.jsx` | Truck, trailer, driver, dispatch assignment, HOS, and road-conditions references/icons | These are trucking operations, not freight-mode choices or filters. |
| `src/Dashboard.jsx` | Truck icon on Fleet & Drivers metric | It represents fleet assets. |
| `src/TrackingVisibilityConsole.jsx`, `src/components/tracking/TrackingMap.jsx`, `src/CustomerPortal.jsx` | Truck icons in telemetry, shipment navigation, or operational summaries | They represent vehicle telemetry or navigation, not freight-mode selection. |
| `src/RoutePlanningModals.jsx` | Road geometry, road names, and road-step guidance | These are route-planning outputs and descriptions, not mode choices. |
| `src/QuoteRateManagement.jsx` | FTL/LTL selection, FTL truck icon, and truckload-specific pricing fields | These remain trucking quote service types; generic labels now distinguish them from freight transport modes. No quote API behavior was changed. |
| `src/api.js` | Truck/driver/trailer field names in API documentation comments | These document dispatch API payloads; no API paths or backend behavior were changed. |
| `src/ShipmentManagement.jsx` | Reefer temperature-control label and truck/trailer assignment details in shipment operations | These are cargo-handling and dispatch details, not freight-mode choices. |

The test search found no assertions for Inland/Rail freight-mode choices, so no tests needed updating or removal. The existing dispatch test reference to “road closed” describes weather/road conditions and was intentionally left unchanged.

## Legacy-data behavior

- Booking list rows preserve a saved `inland`, `road`, or `rail` label and add a neutral Legacy marker. Opening a legacy booking maps its form mode to Ocean; the existing one-time warning explains that it will be saved as Ocean if edited and saved.
- Shipment list rows preserve legacy or unknown mode text and render a neutral icon. Editing a legacy shipment keeps a safe legacy placeholder until Ocean or Air is selected, then uses the matching equipment list; submitting without choosing a supported mode is blocked.
- Missing mode defaults to Ocean in booking and shipment create/edit flows. Customer Portal quote and booking requests normalize all values to Ocean or Air so the backend cannot apply its Inland default.

## Verification

- `npm run build` — passed; Vite reported its large-chunk advisory.
- `npm run test:m10` — passed (20 tests).
- `npm run test:nav` — passed (6 tests).
- `npm run test:sites` — passed (4 tests).
