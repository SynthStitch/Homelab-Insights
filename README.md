# Homelab Insights Dashboard

Homelab Insights is a Vite + React application that streams live telemetry from a Proxmox node, persists snapshots in MongoDB, and exposes an Express API secured with JWT authentication. Administrators can manage users, assign VM-level access, and monitor infrastructure health from a single dashboard.

---

## Key Features

- **Real Proxmox integration** - poll `/status/current` on a configurable cadence, store snapshots in MongoDB, and surface CPU, memory, network, and disk charts.
- **JWT-secured API** - `/api/auth` issues stateless tokens, `/api/users` supports full CRUD with role-based gates, and dedicated Proxmox routes proxy live data.
- **Per-user permissions** - admins can assign each user a list of VM IDs (`*` for all). Tokens embed these assignments so the UI can enforce them.
- **Modern frontend** - React hooks, context-based auth, conditional routing, Apache ECharts visualisations, and a Three.js background effect.

---

## Project Structure

- `src/controllers` - Express controllers (auth, users, proxmox)
- `src/routes` - Route definitions
- `src/models` - Mongoose models (snapshots)
- `src/services` - Client-side fetch helpers
- `src/pages` - React pages (Landing, SignIn, Dashboard, User Management)
- `src/components` - Shared React components
- `public` - Static assets
- `package.json`
- `README.md`

---

## Prerequisites

- Node.js 20+ and npm
- MongoDB running locally (`mongodb://127.0.0.1:27017` by default)
- Proxmox API token with permission to read node and VM status
- (Optional) pnpm or yarn if you prefer alternate package managers

---

## Environment Variables

Copy `.env.example` (or the snippet below) to `.env` inside `mini-project-3/` and update the values:

```ini
PORT=4100
NODE_ENV=development

CORS_ORIGIN=http://localhost:5173

JWT_SECRET=change-me
JWT_EXPIRES=7d

# Proxmox API configuration
PROXMOX_API_BASE=https://192.168.137.x:8006/api2/json
PROXMOX_API_TOKEN_ID=xxxx@pam!apitest // change to your proxmox api
PROXMOX_API_TOKEN_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PROXMOX_DEFAULT_NODE=pve
PROXMOX_DEFAULT_VMID=102
PROXMOX_REJECT_UNAUTHORIZED=false
PROXMOX_POLL_INTERVAL_MS=15000

# MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=First_Proxmox_Dataset

# Frontend defaults
VITE_API_BASE=http://localhost:4100
VITE_PROXMOX_NODE=pve
VITE_PROXMOX_VMID=102
VITE_PROXMOX_POLL_INTERVAL_MS=15000
```

> **Note:** If your Proxmox installation uses a self-signed certificate, set `PROXMOX_REJECT_UNAUTHORIZED=false` or add the certificate to your trust store.

---

## Running the Project

Install dependencies and start both the API and the Vite dev server in separate terminals:

```bash
# Install dependencies
npm install

# Terminal 1: start the API (port 4100)
npm run api

# Terminal 2: start the frontend (port 5173)
npm run dev
```

Open `http://localhost:5173` to access the dashboard. The default admin account is `admin / change-me`. Update the password immediately in the User Management view.

---

## API Overview

| Method | Endpoint                   | Description                                | Auth |
|--------|----------------------------|--------------------------------------------|------|
| POST   | `/api/auth/signin`         | Exchange credentials for a JWT             | none |
| GET    | `/api/users`               | List users (admin only)                    | JWT  |
| POST   | `/api/users`               | Create user (admin only)                   | JWT  |
| PATCH  | `/api/users/:username`     | Update user (admin only)                   | JWT  |
| DELETE | `/api/users/:username`     | Delete user (admin only)                   | JWT  |
| GET    | `/api/proxmox/vms`         | List VMs on the configured node            | none |
| GET    | `/api/proxmox/node-summary`| Node health summary (CPU, memory, storage) | none |
| GET    | `/api/proxmox/snapshots`   | Snapshot history for a VM                  | none |

---

## Backend Logical Model

| Collection        | Purpose                                | Key Fields                                                                                                                                                 |
|-------------------|----------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `users`           | Access control & VM visibility         | `username` (unique), `email` (unique, optional), `passwordHash`, `role` (`viewer`/`admin`), `allowedVmIds` (array of VM ids or `*` for unrestricted access) |
| `proxmoxsnapshots`| Historical telemetry from Proxmox node | `node`, `vmid`, `cpu`, `memory`, `diskRead`, `diskWrite`, `netIn`, `netOut`, `collectedAt`                                                                  |

`allowedVmIds` captures the logical relationship between a user and the VMs they are authorised to inspect. JWTs include this array so both API routes and the frontend can enforce the constraint without extra queries. Snapshots stay denormalised (one document per polling interval) because each record already contains the metrics needed for charting.

---

## User Permissions

- Administrators can manage users on `/users`.
- `allowedVmIds` determines which VMs a user can view. Use `"*"` for full access or provide a list (e.g., `["102", "110"]`). The dashboard respects these assignments when listing VMs.
- JWT payloads include the `allowedVmIds` array so the frontend can apply the constraints without additional API calls.

---

## Development Notes

- **State Management:** React hooks (`useState`, `useEffect`) drive the dashboard. `AuthContext` centralises authentication details and persists tokens in `localStorage`.
- **Error Handling:** API responses use a consistent `{ result, data?, error? }` shape. The frontend surfaces errors via status banners or inline messages.
- **Testing & Linting:** Run `npm run lint` before committing changes.
- **Extensibility:** The Mongo-backed user store seeds an admin user (see `src/services/userStore.js`) and persists role/VM assignments. Proxmox polling lives in `src/services/proxmoxPoller.js`, so adjusting cadence or adding more nodes is straightforward.

---

## Screenshots

| View | Description |
|------|-------------|
| Dashboard | Live charts for CPU, memory, network, and disk I/O, plus node overview. |
| User Management | Create/update/delete users, assign VM permissions, and reset passwords. |

Add your own screenshots in the repository's `docs/` folder if you present this project.

---

## Suggested Demo Flow

1. **Sign in** as admin and show the dashboard updating with live metrics.
2. **Switch to User Management**, create a new viewer, and restrict them to a single VM.
3. **Sign in as the new user** to show the filtered VM list and confirm permissions.
4. Highlight the MongoDB collection (`proxmoxsnapshots`) in Compass to close the loop.

---

## License

This project is private coursework material. Reuse the code responsibly and cite the original source if you extract portions for other work.
