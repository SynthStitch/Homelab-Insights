# Homelab Insights Dashboard

Homelab Insights is a Vite + React app with an Express/MongoDB backend. It pulls telemetry from Proxmox (multi-node, per-node host/IP saved in the UI), stores snapshots in MongoDB, offers JWT-secured admin/user flows, AI assistant chat grounded in recent snapshots, and alert testing via SMS/email (Twilio A2P currently blocked; see note).

---

## Highlights

- **Proxmox + OTEL ready**: poll `/status/current`, store snapshots, and view CPU/mem/network/disk charts. Multi-node support reads host/token from nodes added in the Admin UI; OTEL SDK scaffolded in `src/otel.js`; collectors/Prometheus compose provided.
- **Logs pipeline**: Loki + Promtail compose for Docker logs (see `Docker-Compose/docker-compose.loki.yml`).
- **Auth & RBAC**: JWT auth, admin-only user/node CRUD, VM allowlists; Proxmox data routes are auth-protected.
- **AI copilot**: `/api/assistant/chat` (GPT-5 mini) with UI widget in every page, pulling recent snapshots/node context.
- **Alert tester**: `/api/alerts/test` hits `notificationService` (Twilio/email). Twilio A2P campaign currently rejected; keep SMS disabled until approved.
- **UI pages**: Landing, Learn More, Contact, Dashboard (protected), Admin (protected).

---

## Structure

- `src/controllers` – auth, users, proxmox, nodes, alerts, assistant
- `src/routes` – API routes (auth, users, proxmox, assistant, alerts)
- `src/models` – Mongoose models (users, proxmox snapshots, nodes)
- `src/services` – proxmox clients/poller, assistant client, notification service
- `src/pages` – Landing, Overview, Contact, SignIn, Dashboard, Admin
- `src/components` – shared UI, nav, AI chat widget
- `Docker-Compose` – observability stacks (otel-collector, Prometheus, cadvisor, Loki/Promtail)

---

## Prereqs

- Node.js 20+
- MongoDB (default `mongodb://127.0.0.1:27017`)
- Proxmox API token with read perms (or use demo mode)
- Optional: Docker for the observability/Loki stacks

---

## Environment (root `.env`)

```ini
PORT=4100
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=change-me
JWT_EXPIRES=7d

# Proxmox (fallback if no saved nodes)
PROXMOX_API_BASE=https://192.168.137.x:8006/api2/json
PROXMOX_API_TOKEN_ID=xxxx@pam!apitest
PROXMOX_API_TOKEN_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PROXMOX_DEFAULT_NODE=pve
PROXMOX_DEFAULT_VMID=102
PROXMOX_REJECT_UNAUTHORIZED=false
PROXMOX_POLL_INTERVAL_MS=15000

# Optional secondary (legacy; UI-saved nodes are preferred)
SECOND_PROXMOX_API_BASE=
SECOND_PROXMOX_API_TOKEN_ID=
SECOND_PROXMOX_API_TOKEN_SECRET=
SECOND_PROXMOX_NODE=
SECOND_PROXMOX_VMID=

# Mongo
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=First_Proxmox_Dataset

# Frontend defaults
VITE_API_BASE=http://localhost:4100
VITE_PROXMOX_NODE=pve
VITE_PROXMOX_VMID=102
VITE_PROXMOX_POLL_INTERVAL_MS=15000

# OpenAI assistant
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-mini

# Notifications (Twilio/email; SMS blocked until A2P approved)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_MESSAGING_SID=...
TWILIO_FROM=+19523958985
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=...
```

---

## Run (dev)

```bash
npm install
# Terminal 1: API
npm run api
# Terminal 2: Vite
npm run dev
```

Open `http://localhost:5173`. Protected routes (Dashboard/Admin) require sign-in; default admin is created via the user store seed.

---

## Observability / Logs

- OTEL/Prom stack: `docker-compose -f Docker-Compose/docker-compose.observability.yml up -d`
- Loki/Promtail stack: `docker-compose -f Docker-Compose/docker-compose.loki.yml up -d`
- Promtail config: `Docker-Compose/promtail-config.yml`
- OTEL collector: `Docker-Compose/otel-collector.yaml`

---

## API (selected)

| Method | Endpoint                    | Notes                                     |
|--------|-----------------------------|-------------------------------------------|
| POST   | `/api/auth/signin`          | JWT issuance                              |
| GET    | `/api/users`                | Admin-only list                           |
| POST   | `/api/users`                | Admin-only create                         |
| GET    | `/api/proxmox/nodes`        | List nodes                                |
| GET    | `/api/proxmox/node-summary` | CPU/mem/fs summary (auth required)        |
| GET    | `/api/proxmox/vms`          | VMs for node (auth + VM allowlist filter) |
| POST   | `/api/alerts/test`          | Alert tester (admin)                      |
| POST   | `/api/assistant/chat`       | AI copilot                                |

---

## Notes

- Twilio SMS is blocked until A2P campaign approval; keep SMS tests off or use email during review.
- Dashboard/Admin require auth; Overview/Contact are public.
- Use the Admin console to add nodes; ping/test must pass before save.

---

## Quick demo flow

1) Start API + Vite, sign in as admin.  
2) Add a Proxmox node in Admin; ping/test before saving.  
3) View Dashboard metrics, switch nodes via the dropdown.  
4) Run alert tester (email recommended while A2P is blocked).  
5) Try the AI copilot for node/VM summaries.

---

## How the AI works
- API: `/api/assistant/chat` (protected). UI widget: `src/components/AssistantChat.jsx`.
- Before calling OpenAI (GPT-5 mini), the backend loads recent context (snapshots, node summary, VM list) and injects it into the prompt. Change prompt/context in `src/services/assistantClient.js`; switch models via `.env` (`OPENAI_MODEL`).

---

## Resources Used
Aceternity components:
- Wavy Background: https://ui.aceternity.com/components/wavy-background
- Wobble Card: https://ui.aceternity.com/components/wobble-card
- Encrypted Text: https://ui.aceternity.com/components/encrypted-text
- Resizable Navbar: https://ui.aceternity.com/components/resizable-navbar
- Background Boxes: https://ui.aceternity.com/components/background-boxes
- Signup Form: https://ui.aceternity.com/components/signup-form
- Hover Border Gradient: https://ui.aceternity.com/components/hover-border-gradient

Other libraries:
- ECharts/D3 for charts
- React/Vite, JWT, Joi, bcrypt
- Prometheus/cAdvisor, Loki/Promtail, OTEL collector (compose files in `Docker-Compose/`)
