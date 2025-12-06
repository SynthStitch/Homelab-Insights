import { useEffect, useMemo, useState } from "react";
import "./UserManagementPage.css";
import { useAuth } from "../context/AuthContext.jsx";
import GlowInput from "../components/ui/GlowInput.jsx";

const API_BASE =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE
    ? import.meta.env.VITE_API_BASE.replace(/\/$/, "")
    : "http://localhost:4100";

function normalizeError(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return err.message;
  return "Request failed";
}

async function apiRequest(path, token, options = {}) {
  const { method = "GET", body, headers, signal } = options;
  const init = {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    signal,
    body: body ? JSON.stringify(body) : undefined,
  };

  const response = await fetch(`${API_BASE}${path}`, init);
  if (response.status === 204) {
    return null;
  }

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

const buildDefaultCreateUserForm = () => ({
  username: "",
  email: "",
  password: "",
  role: "viewer",
  allowedVmIds: [],
});

function AdminPage() {
  const { auth, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userError, setUserError] = useState("");
  const [createForm, setCreateForm] = useState(buildDefaultCreateUserForm);
  const [createBusy, setCreateBusy] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState(buildDefaultCreateUserForm);
  const [editBusy, setEditBusy] = useState(false);
  const [availableVms, setAvailableVms] = useState([]);

  const [nodes, setNodes] = useState([]);
  const [nodeForm, setNodeForm] = useState(buildDefaultNodeForm);
  const [nodeStatus, setNodeStatus] = useState({ message: "", variant: "info" });
  const [nodeTested, setNodeTested] = useState(false);
  const [nodeBusy, setNodeBusy] = useState(false);
  const [alertForm, setAlertForm] = useState({ phone: "", email: "", cpuThreshold: 80 });
  const [alertStatus, setAlertStatus] = useState({ message: "", variant: "info" });

  useEffect(() => {
    if (!auth?.token) {
      setUserError("You are not authenticated.");
      setLoadingUsers(false);
      return;
    }
    let aborted = false;
    setLoadingUsers(true);
    setUserError("");

    apiRequest("/api/users", auth.token)
      .then((res) => {
        if (!aborted) {
          setUsers(res?.users ?? []);
        }
      })
      .catch((err) => {
        if (!aborted) {
          if (err.status === 401 || err.status === 403) {
            logout();
            setUserError("Your session expired. Please sign in again.");
          } else {
            setUserError(normalizeError(err));
          }
        }
      })
      .finally(() => {
        if (!aborted) {
          setLoadingUsers(false);
        }
      });

    return () => {
      aborted = true;
    };
  }, [auth?.token, logout]);

  useEffect(() => {
    let aborted = false;
    apiRequest("/api/proxmox/vms", auth?.token)
      .then((res) => {
        if (aborted) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        setAvailableVms(list);
      })
      .catch((err) => {
        if (aborted) return;
        console.error("Failed to load VM list", err);
      });
    return () => {
      aborted = true;
    };
  }, [auth?.token]);

  useEffect(() => {
    let aborted = false;
    apiRequest("/api/proxmox/nodes", auth?.token)
      .then((res) => {
        if (aborted) return;
        setNodes(res?.nodes ?? []);
      })
      .catch((err) => {
        if (aborted) return;
        console.error("Failed to load nodes", err);
      });
    return () => {
      aborted = true;
    };
  }, [auth?.token]);

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) =>
        a.username.localeCompare(b.username, undefined, { sensitivity: "base" })
      ),
    [users]
  );

  const parseSelectValues = (options) => {
    const selected = Array.from(options)
      .filter((option) => option.selected)
      .map((option) => option.value);
    if (selected.includes("*")) {
      return ["*"];
    }
    return selected;
  };

  const handleCreateChange = (event) => {
    const { name, value, options } = event.target;
    if (name === "allowedVmIds") {
      const nextValues = parseSelectValues(options);
      setCreateForm((prev) => ({ ...prev, allowedVmIds: nextValues }));
      return;
    }
    setCreateForm((prev) => ({ ...prev, [name]: value }));
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
    setEditForm(buildDefaultCreateUserForm());
  };

  const handleEditChange = (event) => {
    const { name, value, options } = event.target;
    if (name === "allowedVmIds") {
      const nextValues = parseSelectValues(options);
      setEditForm((prev) => ({ ...prev, allowedVmIds: nextValues }));
      return;
    }
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdateUser = async (event) => {
    event.preventDefault();
    if (!editUser) return;
    setEditBusy(true);
    setUserError("");
    try {
      const payload = {
        email: editForm.email || "",
        role: editForm.role,
        allowedVmIds: editForm.allowedVmIds,
      };
      if (editForm.password && editForm.password.trim()) {
        payload.password = editForm.password;
      }
      await apiRequest(`/api/users/${encodeURIComponent(editUser)}`, auth?.token, {
        method: "PATCH",
        body: payload,
      });
      const refreshed = await apiRequest("/api/users", auth?.token);
      setUsers(refreshed?.users ?? []);
      cancelEdit();
    } catch (err) {
      setUserError(normalizeError(err));
    } finally {
      setEditBusy(false);
    }
  };

  const handleDeleteUser = async (username) => {
    if (!username) return;
    setUserError("");
    try {
      await apiRequest(`/api/users/${encodeURIComponent(username)}`, auth?.token, {
        method: "DELETE",
      });
      const refreshed = await apiRequest("/api/users", auth?.token);
      setUsers(refreshed?.users ?? []);
      if (editUser === username) {
        cancelEdit();
      }
    } catch (err) {
      setUserError(normalizeError(err));
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreateBusy(true);
    setUserError("");
    try {
      await apiRequest("/api/users", auth?.token, {
        method: "POST",
        body: createForm,
      });
      setCreateForm(buildDefaultCreateUserForm());
      const refreshed = await apiRequest("/api/users", auth?.token);
      setUsers(refreshed?.users ?? []);
    } catch (err) {
      setUserError(normalizeError(err));
    } finally {
      setCreateBusy(false);
    }
  };

  const handleNodeChange = (event) => {
    const { name, value, type, checked } = event.target;
    setNodeForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setNodeTested(false);
    setNodeStatus({ message: "", variant: "info" });
  };

  const testNode = async (event) => {
    event.preventDefault();
    setNodeBusy(true);
    setNodeStatus({ message: "Testing node connection...", variant: "info" });
    try {
      await apiRequest("/api/proxmox/nodes/test", auth?.token, {
        method: "POST",
        body: nodeForm,
      });
      setNodeStatus({ message: "Test succeeded. You can now submit.", variant: "success" });
      setNodeTested(true);
    } catch (err) {
      setNodeStatus({ message: normalizeError(err), variant: "error" });
      setNodeTested(false);
    } finally {
      setNodeBusy(false);
    }
  };

  const submitNode = async (event) => {
    event.preventDefault();
    if (!nodeTested) {
      setNodeStatus({ message: "Please test the node before submitting.", variant: "error" });
      return;
    }
    setNodeBusy(true);
    setNodeStatus({ message: "Saving node...", variant: "info" });
    try {
      await apiRequest("/api/proxmox/nodes", auth?.token, {
        method: "POST",
        body: nodeForm,
      });
      const refreshed = await apiRequest("/api/proxmox/nodes", auth?.token);
      setNodes(refreshed?.nodes ?? []);
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
    setNodeStatus({ message: `Pinging ${name}...`, variant: "info" });
    try {
      const res = await apiRequest(`/api/proxmox/nodes/${encodeURIComponent(name)}/ping`, auth?.token);
      setNodeStatus({
        message: `Ping OK for ${name}. VM count: ${res?.result?.vmCount ?? "?"}`,
        variant: "success",
      });
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
    setAlertStatus({ message: "Sending test alert...", variant: "info" });
    try {
      await apiRequest("/api/alerts/test", auth?.token, {
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

  const deleteNode = async (name) => {
    if (!window.confirm(`Delete node "${name}"? This cannot be undone.`)) return;
    setNodeStatus({ message: `Deleting ${name}...`, variant: "info" });
    try {
      await apiRequest(`/api/proxmox/nodes/${encodeURIComponent(name)}`, auth?.token, {
        method: "DELETE",
      });
      const refreshed = await apiRequest("/api/proxmox/nodes", auth?.token);
      setNodes(refreshed?.nodes ?? []);
      setNodeStatus({ message: `Node "${name}" deleted.`, variant: "success" });
    } catch (err) {
      setNodeStatus({ message: normalizeError(err), variant: "error" });
    }
  };

  return (
    <div className="users-page">
      <header className="users-header">
        <h2>Admin Console</h2>
        <p>Manage users and register new Proxmox nodes.</p>
      </header>

      {userError && <div className="users-error">{userError}</div>}

      <section className="users-panel">
        <h3>Create User</h3>
        <form className="users-form" onSubmit={handleCreate}>
          <GlowInput
            label="Username"
            name="username"
            value={createForm.username}
            onChange={handleCreateChange}
            required
          />
          <GlowInput
            label="Email (optional)"
            name="email"
            type="email"
            value={createForm.email}
            onChange={handleCreateChange}
            placeholder="user@homelab.local"
          />
          <GlowInput
            label="Password"
            name="password"
            type="password"
            value={createForm.password}
            onChange={handleCreateChange}
            required
          />
          <label>
            <span>Role</span>
            <select name="role" value={createForm.role} onChange={handleCreateChange}>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            <span>Allowed VMs</span>
            <select
              name="allowedVmIds"
              multiple
              value={createForm.allowedVmIds}
              onChange={handleCreateChange}
            >
              <option value="*">All VMs</option>
              {availableVms.map((vm) => (
                <option key={vm.id ?? vm.name} value={vm.id}>
                  {vm.name ?? vm.id}
                </option>
              ))}
            </select>
            <small className="users-help">
              Hold Ctrl / Cmd to select multiple entries. Choose "All VMs" for unrestricted access.
            </small>
          </label>
          <button type="submit" disabled={createBusy}>
            {createBusy ? "Creating..." : "Create"}
          </button>
        </form>
      </section>

      <section className="users-panel">
        <div className="users-panel-header">
          <h3>Existing Users</h3>
          <span className="users-muted">{loadingUsers ? "Loading..." : `${users.length} users`}</span>
        </div>
        {loadingUsers ? (
          <p className="users-muted">Loading users…</p>
        ) : sortedUsers.length === 0 ? (
          <p className="users-muted">No users yet. Create one above.</p>
        ) : (
          <ul className="users-list">
            {sortedUsers.map((user) => (
              <li key={user.id ?? user.username} className="users-list-item">
                <div className="users-row">
                  <div>
                    <p className="users-name">{user.username}</p>
                    <p className="users-meta">
                      Role: <span>{user.role ?? "viewer"}</span>
                    </p>
                    <p className="users-meta">
                      Email: <span>{user.email ?? "—"}</span>
                    </p>
                    <p className="users-meta">
                      Allowed VMs:{" "}
                      <span>
                        {Array.isArray(user.allowedVmIds) && user.allowedVmIds.includes("*")
                          ? "All VMs"
                          : (user.allowedVmIds || []).join(", ")}
                      </span>
                    </p>
                  </div>
                  <div className="users-actions">
                    <button type="button" onClick={() => startEditUser(user)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => handleDeleteUser(user.username)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {editUser === user.username && (
                  <form className="users-form users-form-inline" onSubmit={handleUpdateUser}>
                    <GlowInput label="Username" name="username" value={editForm.username} disabled />
                    <GlowInput
                      label="Email (optional)"
                      name="email"
                      type="email"
                      value={editForm.email}
                      onChange={handleEditChange}
                      placeholder="user@homelab.local"
                    />
                    <GlowInput
                      label="Password (leave blank to keep)"
                      name="password"
                      type="password"
                      value={editForm.password}
                      onChange={handleEditChange}
                    />
                    <label>
                      <span>Role</span>
                      <select name="role" value={editForm.role} onChange={handleEditChange}>
                        <option value="viewer">Viewer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                    <label>
                      <span>Allowed VMs</span>
                      <select
                        name="allowedVmIds"
                        multiple
                        value={editForm.allowedVmIds}
                        onChange={handleEditChange}
                      >
                        <option value="*">All VMs</option>
                        {availableVms.map((vm) => (
                          <option key={vm.id ?? vm.name} value={vm.id}>
                            {vm.name ?? vm.id}
                          </option>
                        ))}
                      </select>
                      <small className="users-help">
                        Hold Ctrl / Cmd to select multiple entries. Choose "All VMs" for unrestricted access.
                      </small>
                    </label>
                    <div className="users-actions">
                      <button type="submit" disabled={editBusy}>
                        {editBusy ? "Saving..." : "Save"}
                      </button>
                      <button type="button" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="users-panel">
        <h3>Proxmox Nodes</h3>
        <form className="users-form" onSubmit={submitNode}>
          <GlowInput label="Display Name" name="name" value={nodeForm.name} onChange={handleNodeChange} required />
          <GlowInput
            label="Node Identifier"
            name="node"
            value={nodeForm.node}
            onChange={handleNodeChange}
            placeholder="e.g. pve or pve2"
            required
          />
          <GlowInput
            label="API Base URL"
            name="baseUrl"
            value={nodeForm.baseUrl}
            onChange={handleNodeChange}
            placeholder="https://x.x.x.x:8006/api2/json"
            required
          />
          <GlowInput
            label="API Token ID"
            name="tokenId"
            value={nodeForm.tokenId}
            onChange={handleNodeChange}
            placeholder="user@realm!token"
            required
          />
          <GlowInput
            label="API Token Secret"
            name="tokenSecret"
            type="password"
            value={nodeForm.tokenSecret}
            onChange={handleNodeChange}
            required
          />
          <GlowInput
            label="Default VMID (optional)"
            name="defaultVmid"
            value={nodeForm.defaultVmid}
            onChange={handleNodeChange}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              name="rejectUnauthorized"
              checked={nodeForm.rejectUnauthorized}
              onChange={handleNodeChange}
            />
            <span>Reject self-signed certificates</span>
          </label>
          <div className="users-actions">
            <button type="button" onClick={testNode} disabled={nodeBusy}>
              {nodeBusy ? "Testing..." : "Test Connection"}
            </button>
            <button type="submit" disabled={nodeBusy || !nodeTested}>
              {nodeBusy ? "Saving..." : "Save Node"}
            </button>
          </div>
          {nodeStatus.message && (
            <p className={`status-message status-${nodeStatus.variant}`}>{nodeStatus.message}</p>
          )}
        </form>

        <div className="users-panel-sub">
          <h4>Saved Nodes</h4>
          {nodes.length === 0 ? (
            <p className="users-muted">No nodes saved yet.</p>
          ) : (
            <ul className="users-list">
              {nodes.map((n) => (
                <li key={n.name} className="users-list-item">
                  <div className="users-row">
                    <div>
                      <p className="users-name">{n.name}</p>
                      <p className="users-meta">
                        Node: <span>{n.node}</span>
                      </p>
                      <p className="users-meta">
                        Base URL: <span>{n.baseUrl}</span>
                      </p>
                      <p className="users-meta">
                        Default VMID: <span>{n.defaultVmid || "—"}</span>
                      </p>
                    </div>
                    <div className="users-actions">
                      <button type="button" onClick={() => pingNode(n.name)}>
                        Ping
                      </button>
                      <button type="button" className="danger" onClick={() => deleteNode(n.name)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="users-panel">
        <h3>Alert Tester</h3>
        <form className="users-form" onSubmit={sendTestAlert}>
          <GlowInput
            label="SMS (E.164, e.g., +19523958985)"
            name="phone"
            value={alertForm.phone}
            onChange={handleAlertChange}
            placeholder="+1..."
          />
          <GlowInput
            label="Email"
            name="email"
            type="email"
            value={alertForm.email}
            onChange={handleAlertChange}
            placeholder="alerts@homelab.local"
          />
          <GlowInput
            label="CPU Threshold (%)"
            name="cpuThreshold"
            type="number"
            min={1}
            max={100}
            value={alertForm.cpuThreshold}
            onChange={handleAlertChange}
          />
          <button type="submit">Send Test Alert</button>
          {alertStatus.message && (
            <p className={`status-message status-${alertStatus.variant}`}>{alertStatus.message}</p>
          )}
        </form>
      </section>
    </div>
  );
}

export default AdminPage;
