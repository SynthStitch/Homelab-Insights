import { useEffect, useMemo, useState } from "react";
import "./UserManagementPage.css";
import { useAuth } from "../context/AuthContext.jsx";

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

const buildDefaultCreateForm = () => ({
  username: "",
  email: "",
  password: "",
  role: "viewer",
  allowedVmIds: [],
});

function UserManagementPage() {
  const { auth, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createForm, setCreateForm] = useState(buildDefaultCreateForm);
  const [createBusy, setCreateBusy] = useState(false);
  const [editState, setEditState] = useState(null); // { originalUsername, form }
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [availableVms, setAvailableVms] = useState([]);

  useEffect(() => {
    if (!auth?.token) {
      setError("You are not authenticated.");
      setLoading(false);
      return;
    }
    let aborted = false;
    setLoading(true);
    setError("");

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
            setError("Your session expired. Please sign in again.");
          } else {
            setError(normalizeError(err));
          }
        }
      })
      .finally(() => {
        if (!aborted) {
          setLoading(false);
        }
      });

    return () => {
      aborted = true;
    };
  }, [auth?.token, logout, refreshCounter]);

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

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreateBusy(true);
    setError("");
    try {
      await apiRequest("/api/users", auth?.token, {
        method: "POST",
        body: createForm,
      });
      setCreateForm(buildDefaultCreateForm());
      setRefreshCounter((c) => c + 1);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setCreateBusy(false);
    }
  };

  const startEdit = (user) => {
    setEditState({
      originalUsername: user.username,
      form: {
        username: user.username,
        email: user.email ?? "",
        role: user.role ?? "viewer",
        password: "",
        allowedVmIds: Array.isArray(user.allowedVmIds) ? user.allowedVmIds : [],
      },
      busy: false,
      error: "",
    });
  };

  const cancelEdit = () => {
    setEditState(null);
  };

  const handleEditChange = (event) => {
    if (!editState) return;
    const { name, value, options } = event.target;
    if (name === "allowedVmIds") {
      const nextValues = parseSelectValues(options);
      setEditState((prev) => ({
        ...prev,
        form: { ...prev.form, allowedVmIds: nextValues },
      }));
      return;
    }
    setEditState((prev) => ({
      ...prev,
      form: { ...prev.form, [name]: value },
    }));
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    if (!editState) return;
    setEditState((prev) => ({ ...prev, busy: true, error: "" }));
    const body = {
      username: editState.form.username,
      role: editState.form.role,
      allowedVmIds: editState.form.allowedVmIds,
    };
    if (editState.form.password) {
      body.password = editState.form.password;
    }
    try {
      await apiRequest(
        `/api/users/${encodeURIComponent(editState.originalUsername)}`,
        auth?.token,
        {
          method: "PATCH",
          body,
        }
      );
      setEditState(null);
      setRefreshCounter((c) => c + 1);
    } catch (err) {
      setEditState((prev) => ({ ...prev, error: normalizeError(err) }));
    } finally {
      setEditState((prev) => (prev ? { ...prev, busy: false } : prev));
    }
  };

  const handleDelete = async (username) => {
    if (!window.confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    setError("");
    try {
      await apiRequest(`/api/users/${encodeURIComponent(username)}`, auth?.token, {
        method: "DELETE",
      });
      setRefreshCounter((c) => c + 1);
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  const vmNameMap = useMemo(() => {
    const map = new Map();
    for (const vm of availableVms) {
      const key = String(vm?.id ?? "");
      if (!key) continue;
      map.set(key, vm?.name ?? key);
    }
    return map;
  }, [availableVms]);

  const describeAssignments = (allowedVmIds) => {
    if (Array.isArray(allowedVmIds) && allowedVmIds.includes("*")) {
      return "All VMs";
    }
    if (!allowedVmIds || allowedVmIds.length === 0) {
      return "None";
    }
    return allowedVmIds.map((id) => vmNameMap.get(String(id)) ?? id).join(", ");
  };

  return (
    <div className="users-page">
      <header className="users-header">
        <h2>User Management</h2>
        <p>
          Create, update, or remove users in MongoDB. Assign each account a role plus the VMs they are allowed to see.
        </p>
        <p className="users-api-hint">
          API base: <code>{API_BASE}</code>
        </p>
      </header>

      {error && <div className="users-error">{error}</div>}

      <section className="users-panel">
        <h3>Create User</h3>
        <form className="users-form" onSubmit={handleCreate}>
          <label>
            <span>Username</span>
            <input
              name="username"
              value={createForm.username}
              onChange={handleCreateChange}
              minLength={2}
              required
            />
          </label>
          <label>
            <span>Email (optional)</span>
            <input
              name="email"
              type="email"
              value={createForm.email}
              onChange={handleCreateChange}
              placeholder="user@homelab.local"
            />
          </label>
          <label>
            <span>Password</span>
            <input
              name="password"
              type="password"
              value={createForm.password}
              onChange={handleCreateChange}
              minLength={4}
              required
            />
          </label>
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
          <button
            type="button"
            onClick={() => setRefreshCounter((c) => c + 1)}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loading ? (
          <p className="users-muted">Loading users…</p>
        ) : sortedUsers.length === 0 ? (
          <p className="users-muted">No users yet. Create one above.</p>
        ) : (
          <ul className="users-list">
            {sortedUsers.map((user) => {
              const isEditing = editState?.originalUsername === user.username;
              return (
                <li key={user.id ?? user.username} className="users-list-item">
                  {isEditing ? (
                    <form className="users-edit-form" onSubmit={submitEdit}>
                      <label>
                        <span>Username</span>
                        <input
                          name="username"
                          value={editState.form.username}
                          onChange={handleEditChange}
                          minLength={2}
                          required
                        />
                      </label>
                      <label>
                        <span>Email (optional)</span>
                        <input
                          name="email"
                          type="email"
                          value={editState.form.email}
                          onChange={handleEditChange}
                          placeholder="user@homelab.local"
                        />
                      </label>
                      <label>
                        <span>Role</span>
                        <select
                          name="role"
                          value={editState.form.role}
                          onChange={handleEditChange}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="admin">Admin</option>
                        </select>
                      </label>
                      <label>
                        <span>Allowed VMs</span>
                        <select
                          name="allowedVmIds"
                          multiple
                          value={editState.form.allowedVmIds}
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
                      <label>
                        <span>New Password (optional)</span>
                        <input
                          name="password"
                          type="password"
                          value={editState.form.password}
                          onChange={handleEditChange}
                          placeholder="Leave blank to keep"
                          minLength={4}
                        />
                      </label>
                      {editState.error && <p className="users-error-inline">{editState.error}</p>}
                      <div className="users-actions">
                        <button type="submit" disabled={editState.busy}>
                          {editState.busy ? "Saving…" : "Save"}
                        </button>
                        <button type="button" onClick={cancelEdit} disabled={editState.busy}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
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
                          Created:{" "}
                          <span>{user.createdAt ? new Date(user.createdAt).toLocaleString() : "-"}</span>
                        </p>
                        <p className="users-meta">
                          Allowed VMs: <span>{describeAssignments(user.allowedVmIds)}</span>
                        </p>
                      </div>
                      <div className="users-actions">
                        <button type="button" onClick={() => startEdit(user)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => handleDelete(user.username)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default UserManagementPage;
