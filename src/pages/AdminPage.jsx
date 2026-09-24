import { useEffect, useMemo, useState } from "react";
import "./AdminPage.css";
import { useAuth } from "../context/AuthContext.jsx";
import Field from "../components/Field.jsx";

const API_BASE =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE
    ? import.meta.env.VITE_API_BASE.replace(/\/$/, "")
    : ""; // ponytail: same-origin in prod; set VITE_API_BASE only for split dev servers

function normalizeError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  return err.message || "Request failed";
}

async function apiRequest(path, token, options = {}) {
  const { method = "GET", body, headers, signal } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    signal,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return null;
  const data = await response
    .json()
    .catch(() => ({ error: `HTTP ${response.status} ${response.statusText}` }));
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

const buildDefaultNodeForm = () => ({
  name: "",
  baseUrl: "",
  tokenId: "",
  tokenSecret: "",
  node: "",
  defaultVmid: "",
  rejectUnauthorized: true,
});

const buildDefaultUserForm = () => ({
  username: "",
  email: "",
  password: "",
  role: "viewer",
  allowedVmIds: [],
});

const parseSelectValues = (options) => {
  const selected = Array.from(options)
    .filter((option) => option.selected)
    .map((option) => option.value);
  return selected.includes("*") ? ["*"] : selected;
};

const VM_HELP = "Hold Ctrl / Cmd to select several. “All VMs” grants unrestricted access.";

function UserFields({ form, onChange, availableVms, usernameDisabled = false, passwordLabel = "Password" }) {
  return (
    <>
      <Field
        label="Username"
        name="username"
        value={form.username}
        onChange={onChange}
        disabled={usernameDisabled}
        required={!usernameDisabled}
        autoComplete="off"
      />
      <Field
        label="Email (optional)"
        name="email"
        type="email"
        value={form.email}
        onChange={onChange}
        placeholder="user@homelab.local"
      />
      <Field
        label={passwordLabel}
        name="password"
        type="password"
        value={form.password}
        onChange={onChange}
        required={!usernameDisabled}
        autoComplete="new-password"
      />
      <Field as="select" label="Role" name="role" value={form.role} onChange={onChange}>
        <option value="viewer">Viewer</option>
        <option value="admin">Admin</option>
      </Field>
      <Field
        as="select"
        className="field--wide"
        label="Allowed VMs"
        name="allowedVmIds"
        multiple
        value={form.allowedVmIds}
        onChange={onChange}
        help={VM_HELP}
      >
        <option value="*">All VMs</option>
        {availableVms.map((vm) => (
          <option key={vm.id ?? vm.name} value={vm.id}>
            {vm.name ?? vm.id}
          </option>
        ))}
      </Field>
    </>
  );
}

function AdminPage() {
  const { auth, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userError, setUserError] = useState("");
  const [createForm, setCreateForm] = useState(buildDefaultUserForm);
  const [createBusy, setCreateBusy] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState(buildDefaultUserForm);
  const [editBusy, setEditBusy] = useState(false);
  const [availableVms, setAvailableVms] = useState([]);

  const [nodes, setNodes] = useState([]);
  const [nodeForm, setNodeForm] = useState(buildDefaultNodeForm);
  const [nodeStatus, setNodeStatus] = useState({ message: "", variant: "info" });
  const [nodeTested, setNodeTested] = useState(false);
  const [nodeBusy, setNodeBusy] = useState(false);
  const [alertForm, setAlertForm] = useState({ phone: "", email: "", cpuThreshold: 80 });
  const [alertStatus, setAlertStatus] = useState({ message: "", variant: "info" });
  const [promForm, setPromForm] = useState({ url: "", alertmanagerUrl: "", token: "", enabled: true, hasToken: false });
  const [promStatus, setPromStatus] = useState({ message: "", variant: "info" });
  const [promBusy, setPromBusy] = useState(false);
  const [promProbe, setPromProbe] = useState(null);

  const token = auth?.token;

  useEffect(() => {
    if (!token) {
      setUserError("You are not authenticated.");
      setLoadingUsers(false);
      return;
    }
    let aborted = false;
    setLoadingUsers(true);
    setUserError("");
    apiRequest("/api/users", token)
      .then((res) => !aborted && setUsers(res?.users ?? []))
      .catch((err) => {
        if (aborted) return;
        if (err.status === 401 || err.status === 403) {
          logout();
          setUserError("Your session expired. Please sign in again.");
        } else {
          setUserError(normalizeError(err));
        }
      })
      .finally(() => !aborted && setLoadingUsers(false));
    return () => {
      aborted = true;
    };
  }, [token, logout]);

  useEffect(() => {
    let aborted = false;
    apiRequest("/api/proxmox/vms", token)
      .then((res) => !aborted && setAvailableVms(Array.isArray(res?.data) ? res.data : []))
      .catch((err) => !aborted && console.error("Failed to load VM list", err));
    return () => {
      aborted = true;
    };
  }, [token]);

  useEffect(() => {
    let aborted = false;
    apiRequest("/api/proxmox/nodes", token)
      .then((res) => !aborted && setNodes(res?.nodes ?? []))
      .catch((err) => !aborted && console.error("Failed to load nodes", err));
    return () => {
      aborted = true;
    };
  }, [token]);

  useEffect(() => {
    let aborted = false;
    apiRequest("/api/integrations/prometheus", token)
      .then((res) => {
        if (aborted || !res?.prometheus) return;
        const p = res.prometheus;
        setPromForm({ url: p.url || "", alertmanagerUrl: p.alertmanagerUrl || "", token: "", enabled: p.enabled ?? true, hasToken: Boolean(p.hasToken) });
      })
      .catch((err) => !aborted && console.error("Failed to load integrations", err));
    return () => {
      aborted = true;
    };
  }, [token]);

  const handlePromChange = (event) => {
    const { name, value, type, checked } = event.target;
    setPromForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    setPromStatus({ message: "", variant: "info" });
  };

  const promBody = () => ({
    url: promForm.url.trim(),
    alertmanagerUrl: promForm.alertmanagerUrl.trim(),
    token: promForm.token,
    enabled: promForm.enabled,
  });

  const testProm = async () => {
    setPromBusy(true);
    setPromStatus({ message: "Probing Prometheus…", variant: "info" });
    try {
      const res = await apiRequest("/api/integrations/prometheus/test", token, { method: "POST", body: promBody() });
      setPromProbe(res?.result ?? null);
      const am = res?.result?.alertmanager;
      setPromStatus({
        message: `Prometheus ${res?.result?.version} · ${res?.result?.up}/${res?.result?.targets} targets up${am ? (am.ok ? ` · Alertmanager ${am.version}` : ` · Alertmanager unreachable: ${am.error}`) : ""}`,
        variant: am && !am.ok ? "error" : "success",
      });
    } catch (err) {
      setPromProbe(null);
      setPromStatus({ message: normalizeError(err), variant: "error" });
    } finally {
      setPromBusy(false);
    }
  };

  const saveProm = async (event) => {
    event.preventDefault();
    setPromBusy(true);
    setPromStatus({ message: "Saving…", variant: "info" });
    try {
      const res = await apiRequest("/api/integrations/prometheus", token, { method: "PUT", body: promBody() });
      const p = res?.prometheus ?? {};
      setPromForm((prev) => ({ ...prev, token: "", hasToken: Boolean(p.hasToken), enabled: p.enabled ?? prev.enabled }));
      setPromStatus({ message: p.enabled ? "Saved. Prometheus is enabled." : "Saved. Prometheus is disabled.", variant: "success" });
    } catch (err) {
      setPromStatus({ message: normalizeError(err), variant: "error" });
    } finally {
      setPromBusy(false);
    }
  };

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: "base" })),
    [users],
  );

  const formChange = (setter) => (event) => {
    const { name, value, options } = event.target;
    setter((prev) => ({
      ...prev,
      [name]: name === "allowedVmIds" ? parseSelectValues(options) : value,
    }));
  };
  const handleCreateChange = formChange(setCreateForm);
  const handleEditChange = formChange(setEditForm);

  const refreshUsers = async () => {
    const refreshed = await apiRequest("/api/users", token);
    setUsers(refreshed?.users ?? []);
  };

  const startEditUser = (user) => {
    setEditUser(user.username);
    setEditForm({
      username: user.username,
      email: user.email || "",
      password: "",
      role: user.role || "viewer",
      allowedVmIds: Array.isArray(user.allowedVmIds) ? user.allowedVmIds : [],
    });
  };

  const cancelEdit = () => {
    setEditUser(null);
    setEditForm(buildDefaultUserForm());
  };

  const handleUpdateUser = async (event) => {
    event.preventDefault();
    if (!editUser) return;
    setEditBusy(true);
    setUserError("");
    try {
      const payload = { email: editForm.email || "", role: editForm.role, allowedVmIds: editForm.allowedVmIds };
      if (editForm.password?.trim()) payload.password = editForm.password;
      await apiRequest(`/api/users/${encodeURIComponent(editUser)}`, token, { method: "PATCH", body: payload });
      await refreshUsers();
      cancelEdit();
    } catch (err) {
      setUserError(normalizeError(err));
    } finally {
      setEditBusy(false);
    }
  };

  const handleDeleteUser = async (username) => {
    if (!username || !window.confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    setUserError("");
    try {
      await apiRequest(`/api/users/${encodeURIComponent(username)}`, token, { method: "DELETE" });
      await refreshUsers();
      if (editUser === username) cancelEdit();
    } catch (err) {
      setUserError(normalizeError(err));
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreateBusy(true);
    setUserError("");
    try {
      await apiRequest("/api/users", token, { method: "POST", body: createForm });
      setCreateForm(buildDefaultUserForm());
      await refreshUsers();
    } catch (err) {
      setUserError(normalizeError(err));
    } finally {
      setCreateBusy(false);
    }
  };

  const handleNodeChange = (event) => {
    const { name, value, type, checked } = event.target;
    setNodeForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    setNodeTested(false);
    setNodeStatus({ message: "", variant: "info" });
  };

  const testNode = async (event) => {
    event.preventDefault();
    setNodeBusy(true);
    setNodeStatus({ message: "Testing connection…", variant: "info" });
    try {
      await apiRequest("/api/proxmox/nodes/test", token, { method: "POST", body: nodeForm });
      setNodeStatus({ message: "Connection OK. You can save this node.", variant: "success" });
      setNodeTested(true);
    } catch (err) {
      setNodeStatus({ message: normalizeError(err), variant: "error" });
      setNodeTested(false);
    } finally {
      setNodeBusy(false);
    }
  };

  const refreshNodes = async () => {
    const refreshed = await apiRequest("/api/proxmox/nodes", token);
    setNodes(refreshed?.nodes ?? []);
  };

  const submitNode = async (event) => {
    event.preventDefault();
    if (!nodeTested) {
      setNodeStatus({ message: "Test the connection before saving.", variant: "error" });
      return;
    }
    setNodeBusy(true);
    setNodeStatus({ message: "Saving node…", variant: "info" });
    try {
      await apiRequest("/api/proxmox/nodes", token, { method: "POST", body: nodeForm });
      await refreshNodes();
      setNodeForm(buildDefaultNodeForm());
      setNodeTested(false);
      setNodeStatus({ message: "Node saved.", variant: "success" });
    } catch (err) {
      setNodeStatus({ message: normalizeError(err), variant: "error" });
    } finally {
      setNodeBusy(false);
    }
  };

  const pingNode = async (name) => {
    setNodeStatus({ message: `Pinging ${name}…`, variant: "info" });
    try {
      const res = await apiRequest(`/api/proxmox/nodes/${encodeURIComponent(name)}/ping`, token);
      setNodeStatus({ message: `${name} OK. VM count: ${res?.result?.vmCount ?? "?"}`, variant: "success" });
    } catch (err) {
      setNodeStatus({ message: normalizeError(err), variant: "error" });
    }
  };

  const deleteNode = async (name) => {
    if (!window.confirm(`Delete node "${name}"? This cannot be undone.`)) return;
    setNodeStatus({ message: `Deleting ${name}…`, variant: "info" });
    try {
      await apiRequest(`/api/proxmox/nodes/${encodeURIComponent(name)}`, token, { method: "DELETE" });
      await refreshNodes();
      setNodeStatus({ message: `Node "${name}" deleted.`, variant: "success" });
    } catch (err) {
      setNodeStatus({ message: normalizeError(err), variant: "error" });
    }
  };

  const handleAlertChange = (event) => {
    const { name, value } = event.target;
    setAlertForm((prev) => ({ ...prev, [name]: value }));
    setAlertStatus({ message: "", variant: "info" });
  };

  const sendTestAlert = async (event) => {
    event.preventDefault();
    setAlertStatus({ message: "Sending test alert…", variant: "info" });
    try {
      await apiRequest("/api/alerts/test", token, {
        method: "POST",
        body: {
          phone: alertForm.phone || undefined,
          email: alertForm.email || undefined,
          cpuThreshold: Number(alertForm.cpuThreshold) || 80,
        },
      });
      setAlertStatus({ message: "Test alert sent.", variant: "success" });
    } catch (err) {
      setAlertStatus({ message: normalizeError(err), variant: "error" });
    }
  };

  const describeVms = (allowedVmIds) =>
    Array.isArray(allowedVmIds) && allowedVmIds.includes("*")
      ? "All VMs"
      : (allowedVmIds || []).join(", ") || "None";

  return (
    <div className="page admin">
      <header className="page-head">
        <div>
          <p className="eyebrow">admin console</p>
          <h1>Users, nodes and alerts</h1>
          <p className="lede">Manage who can sign in, which Proxmox hosts are polled, and test notifications.</p>
        </div>
      </header>

      {userError ? <div className="alert">{userError}</div> : null}

      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">Create user</span>
        </div>
        <form className="form-grid" onSubmit={handleCreate}>
          <UserFields form={createForm} onChange={handleCreateChange} availableVms={availableVms} />
          <div className="actions">
            <button type="submit" className="btn btn--primary" disabled={createBusy}>
              {createBusy ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">Users</span>
          <span className="panel__meta">{loadingUsers ? "loading…" : `${users.length} total`}</span>
        </div>
        {loadingUsers ? (
          <p className="muted">Loading users…</p>
        ) : sortedUsers.length === 0 ? (
          <p className="muted">No users yet. Create one above.</p>
        ) : (
          <ul className="rows">
            {sortedUsers.map((user) => (
              <li key={user.id ?? user.username} className="row">
                <div className="row__main">
                  <div>
                    <p className="row__title">
                      {user.username}
                      <span className={`role role--${user.role ?? "viewer"}`}>{user.role ?? "viewer"}</span>
                    </p>
                    <div className="row__meta">
                      <span>
                        <b>Email</b>
                        {user.email || "—"}
                      </span>
                      <span>
                        <b>VMs</b>
                        {describeVms(user.allowedVmIds)}
                      </span>
                    </div>
                  </div>
                  <div className="actions">
                    <button type="button" className="btn btn--sm" onClick={() => startEditUser(user)}>
                      Edit
                    </button>
                    <button type="button" className="btn btn--sm btn--danger" onClick={() => handleDeleteUser(user.username)}>
                      Delete
                    </button>
                  </div>
                </div>
                {editUser === user.username ? (
                  <form className="form-grid row__edit" onSubmit={handleUpdateUser}>
                    <UserFields
                      form={editForm}
                      onChange={handleEditChange}
                      availableVms={availableVms}
                      usernameDisabled
                      passwordLabel="New password (blank keeps current)"
                    />
                    <div className="actions">
                      <button type="submit" className="btn btn--primary btn--sm" disabled={editBusy}>
                        {editBusy ? "Saving…" : "Save changes"}
                      </button>
                      <button type="button" className="btn btn--sm" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">Add Proxmox node</span>
          <span className="panel__meta">test before save</span>
        </div>
        <form className="form-grid" onSubmit={submitNode}>
          <Field
            label="Display name"
            name="name"
            value={nodeForm.name}
            onChange={handleNodeChange}
            placeholder="pve-1"
            help="Unique. This is what the dashboard shows."
            required
          />
          <Field
            label="Node identifier"
            name="node"
            value={nodeForm.node}
            onChange={handleNodeChange}
            placeholder="pve"
            help="The Proxmox node name. Several hosts can share it."
            required
          />
          <Field
            className="field--wide"
            label="API base URL"
            name="baseUrl"
            value={nodeForm.baseUrl}
            onChange={handleNodeChange}
            placeholder="https://10.0.0.10:8006/api2/json"
            required
          />
          <Field
            label="API token ID"
            name="tokenId"
            value={nodeForm.tokenId}
            onChange={handleNodeChange}
            placeholder="user@realm!token"
            required
          />
          <Field
            label="API token secret"
            name="tokenSecret"
            type="password"
            value={nodeForm.tokenSecret}
            onChange={handleNodeChange}
            autoComplete="off"
            required
          />
          <Field
            label="Default VMID (optional)"
            name="defaultVmid"
            value={nodeForm.defaultVmid}
            onChange={handleNodeChange}
            placeholder="100"
          />
          <label className="check">
            <input
              type="checkbox"
              name="rejectUnauthorized"
              checked={nodeForm.rejectUnauthorized}
              onChange={handleNodeChange}
            />
            Reject self-signed certificates
          </label>
          <div className="actions">
            <button type="button" className="btn" onClick={testNode} disabled={nodeBusy}>
              {nodeBusy ? "Testing…" : "Test connection"}
            </button>
            <button type="submit" className="btn btn--primary" disabled={nodeBusy || !nodeTested}>
              {nodeBusy ? "Saving…" : "Save node"}
            </button>
          </div>
          {nodeStatus.message ? (
            <p className={`status-text status-text--${nodeStatus.variant}`} role="status">
              {nodeStatus.message}
            </p>
          ) : null}
        </form>

        <div className="panel__head">
          <span className="panel__title">Saved nodes</span>
          <span className="panel__meta">{nodes.length} configured</span>
        </div>
        {nodes.length === 0 ? (
          <p className="muted">No nodes saved yet. The API falls back to the values in .env.</p>
        ) : (
          <ul className="rows">
            {nodes.map((n) => (
              <li key={n.name} className="row">
                <div className="row__main">
                  <div>
                    <p className="row__title">{n.name}</p>
                    <div className="row__meta">
                      <span>
                        <b>Node</b>
                        {n.node}
                      </span>
                      <span>
                        <b>URL</b>
                        <span className="sensitive">{n.baseUrl}</span>
                      </span>
                      <span>
                        <b>VMID</b>
                        {n.defaultVmid || "—"}
                      </span>
                    </div>
                  </div>
                  <div className="actions">
                    <button type="button" className="btn btn--sm" onClick={() => pingNode(n.name)}>
                      Ping
                    </button>
                    <button type="button" className="btn btn--sm btn--danger" onClick={() => deleteNode(n.name)}>
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">Integrations · Prometheus</span>
          <span className="panel__meta">{promForm.enabled && promForm.url ? "enabled" : "not configured"}</span>
        </div>
        <form className="form-grid" onSubmit={saveProm}>
          <Field
            className="field--wide"
            label="Prometheus URL"
            name="url"
            value={promForm.url}
            onChange={handlePromChange}
            placeholder="http://10.8.8.102:9090"
            help="The server that scrapes your PVE exporter. Charts can read from it later; the browser never talks to it directly."
          />
          <Field
            label="Alertmanager URL (optional)"
            name="alertmanagerUrl"
            value={promForm.alertmanagerUrl}
            onChange={handlePromChange}
            placeholder="http://10.8.8.102:9093"
          />
          <Field
            label={promForm.hasToken ? "Bearer token (stored; blank keeps it, - clears)" : "Bearer token (optional)"}
            name="token"
            type="password"
            value={promForm.token}
            onChange={handlePromChange}
            autoComplete="off"
          />
          <label className="check">
            <input type="checkbox" name="enabled" checked={promForm.enabled} onChange={handlePromChange} />
            Enabled
          </label>
          <div className="actions">
            <button type="button" className="btn" onClick={testProm} disabled={promBusy || !promForm.url.trim()}>
              {promBusy ? "Working…" : "Test connection"}
            </button>
            <button type="submit" className="btn btn--primary" disabled={promBusy}>
              Save
            </button>
          </div>
          {promStatus.message ? (
            <p className={`status-text status-text--${promStatus.variant}`} role="status">
              {promStatus.message}
            </p>
          ) : null}
          {promProbe?.jobs?.length ? (
            <p className="field__help">
              Jobs: <span className="mono">{promProbe.jobs.join(", ")}</span>
            </p>
          ) : null}
        </form>
      </section>

      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">Alert tester</span>
          <span className="panel__meta">email recommended while SMS is pending approval</span>
        </div>
        <form className="form-grid" onSubmit={sendTestAlert}>
          <Field
            label="SMS (E.164)"
            name="phone"
            value={alertForm.phone}
            onChange={handleAlertChange}
            placeholder="+15551234567"
          />
          <Field
            label="Email"
            name="email"
            type="email"
            value={alertForm.email}
            onChange={handleAlertChange}
            placeholder="alerts@homelab.local"
          />
          <Field
            label="CPU threshold (%)"
            name="cpuThreshold"
            type="number"
            min={1}
            max={100}
            value={alertForm.cpuThreshold}
            onChange={handleAlertChange}
          />
          <div className="actions">
            <button type="submit" className="btn btn--primary">
              Send test alert
            </button>
          </div>
          {alertStatus.message ? (
            <p className={`status-text status-text--${alertStatus.variant}`} role="status">
              {alertStatus.message}
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}

export default AdminPage;
