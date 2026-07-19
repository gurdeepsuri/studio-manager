# Studio Manager

A private, phone-first app for design & architecture studios to run the business
day to day — clients, projects, quotes, invoices, appointments, expenses, hours,
vendors and reports, in one place.

It's a **local-first PWA**: everything is stored on the device (in the browser's
IndexedDB), works offline, and installs to a phone home screen or a laptop. No
account, no server, no monthly cost. Because the data lives on the device, use
**Settings → Export backup** regularly; to move to a new device, export there and
import here.

> **Growing into a product.** The whole data layer is isolated in `js/db.js`
> behind an async, REST-shaped API (`list / get / save / remove`). Turning this
> into a synced, multi-user, multi-tenant SaaS (accounts, web + mobile, push
> notifications, calendar sync, emailed invoices) means implementing that same
> interface against a backend — the views and business logic don't change.

## Modules

- **Dashboard** — today at a glance: upcoming meetings, active projects,
  outstanding & overdue invoices, received this month, spend this month, quick-add.
- **Projects** — the core unit: each project holds its **client's details**, plus
  live rollups of money received, expenses and profit. (Clients live on the
  project — a project has one client.)
- **Quotes** — line-item estimates with GST/discount, status, printable PDF (with
  your logo), share, and one-tap convert-to-invoice. Addressed to a client
  (via its project) or a vendor.
- **Invoices** — addressed to a **client (via project) or a vendor**, with a
  **direction** (they owe me / I owe them, i.e. vendor bills), payment tracking,
  auto status (Sent / Partially Paid / Paid / Overdue), a **logo + description**
  on the printed letterhead, and share.
- **Schedule** — agenda + month calendar, reminders, and "Add to Calendar"
  (.ics) so the phone's own calendar notifies you.
- **Vendors** — contractors & suppliers by trade, with search, tap-to-call /
  WhatsApp, and their invoices & bills.
- **Expenses** — spend tracking, taggable to projects.
- **Reports** — money in vs out, net profit, unpaid vendor bills (payables),
  a 6-month trend, and profit by project.
- **Settings** — business profile + **company logo**, currency/GST defaults,
  default notes/terms, quote & invoice numbering, backup/restore, passcode lock.

## Run locally

Static files — serve the repo root and open it:

```bash
python3 -m http.server 8000    # then visit http://localhost:8000/
```

(Any static server works: `npx serve`, VS Code Live Server, etc. Opening
`index.html` directly with `file://` won't work — modules need a server.)

## Host it

Deploys as-is to GitHub Pages, Netlify or Vercel. On GitHub Pages, enable
**Settings → Pages → Deploy from branch → main → / (root)**.

### Install to a phone

- **iPhone (Safari):** open the URL → Share → **Add to Home Screen**.
- **Android (Chrome):** open the URL → menu → **Install app**.

## Configure it for a studio

Open **Settings** and set the business name, contact details, currency, default
hourly rate, GST %, and quote/invoice prefixes. Everything else (the name shown
on the dashboard, printed quotes and invoices) follows from there.

## Security & privacy

- Data never leaves the device; there are no third-party network calls.
- A strict Content-Security-Policy (`default-src 'self'`) is set on the shell.
- All user-entered text is HTML-escaped before rendering.
- Optional device passcode lock.

## Project layout

```
index.html            app shell
manifest.webmanifest  installable metadata
sw.js                 offline service worker
css/app.css           styles + self-hosted fonts
js/                   app.js (bootstrap), router, state, db (storage),
                      ui, form, util, share, and one file per screen in views/
assets/               fonts + app icon
```
