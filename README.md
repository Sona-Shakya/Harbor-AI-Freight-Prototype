# Harbor — AI-native freight management prototype

Harbor is an interactive product prototype for import and export companies. It combines a conversational mission workspace with the standard operational records a freight team needs.

## Included

- AI-guided import, export, and freight-invoice missions
- Human approval gates before partner communication or booking
- Freight-offer comparison and landed-cost clarification
- Shipment plan, evidence, source links, and activity history
- Export-document mismatch detection and correction flow
- Freight-invoice variance review and dispute flow
- 20 operational record modules covering partners, orders, rates, bookings, shipments, tracking, transport, documents, customs, costs, invoices, claims, portal, reports, and administration
- Search, filters, record forms, CSV exports, and responsive desktop/mobile layouts
- Session-only demo sign-in, password visibility, validation, and logout

The assistant and integrations are scripted sample behavior for product validation. No email, carrier, customs, accounting, live AI service, or real authentication service is connected. Login state is stored only for the current browser session.

## Run locally

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

## Key files

- `src/App.jsx` — application shell, missions, workflows, and record modules
- `src/data.js` — sample operational data and module definitions
- `src/styles.css` — responsive product styling
- `public/harbor-mark.png` — Harbor brand mark
- `design-qa.md` — verification record
