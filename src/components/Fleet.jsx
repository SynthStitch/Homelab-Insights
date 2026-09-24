import { useEffect, useMemo, useState } from "react";
import { fetchNodeVms } from "../services/proxmoxApiClient.js";
import "./Fleet.css";

// ponytail: folders live in localStorage; move to a /api/users prefs field when they must sync across devices.
const FOLDERS_KEY = "homelab-fleet-folders";
const MODE_KEY = "homelab-fleet-mode";
const UNSORTED = "__unsorted";

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const DEMO_GUESTS = [
  { node: "pve", id: 100, type: "lxc", name: "docker", status: "running" },
  { node: "pve", id: 108, type: "lxc", name: "fileserver", status: "running" },
  { node: "pve", id: 102, type: "qemu", name: "truenas", status: "stopped" },
  { node: "pve", id: 103, type: "qemu", name: "test", status: "running" },
  { node: "pve", id: 104, type: "qemu", name: "truenas-copy", status: "stopped" },
  { node: "pve", id: 777, type: "qemu", name: "ubuntu-example", status: "stopped" },
  { node: "pve-1", id: 201, type: "lxc", name: "pihole", status: "running" },
  { node: "pve-1", id: 202, type: "lxc", name: "n8n", status: "running" },
  { node: "pve-1", id: 210, type: "qemu", name: "home-assistant", status: "running" },
  { node: "pve-1", id: 211, type: "qemu", name: "win11", status: "stopped" },
];

const keyOf = (g) => `${g.node}:${g.id}`;

export default function Fleet({ nodes = [], selectedNode, selectedVmid, onSelect, intervalMs = 15000, demo = false }) {
  const [guests, setGuests] = useState([]);
  const [mode, setMode] = useState(() => readJson(MODE_KEY, "node"));
  const [folders, setFolders] = useState(() => readJson(FOLDERS_KEY, {}));
  const [hotGroup, setHotGroup] = useState(null);
  const [hotKey, setHotKey] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, JSON.stringify(mode));
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
    } catch {
      /* private mode: fine, folders just won't persist */
    }
  }, [mode, folders]);

  useEffect(() => {
    if (demo) {
      setGuests(DEMO_GUESTS);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      const results = await Promise.all(
        nodes.map((node) =>
          fetchNodeVms({ node })
            .then((res) => (Array.isArray(res?.data) ? res.data : []).map((vm) => ({ ...vm, node: vm.node || node })))
            .catch(() => []),
        ),
      );
      if (!cancelled) setGuests(results.flat());
    };
    load();
    const timer = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [nodes, intervalMs, demo]);

  const groups = useMemo(() => {
    if (mode === "type") {
      return [
        { id: "qemu", label: "VMs", tag: "VM", items: guests.filter((g) => g.type !== "lxc") },
        { id: "lxc", label: "Containers", tag: "CT", items: guests.filter((g) => g.type === "lxc") },
      ];
    }
    if (mode === "custom") {
      const placed = new Set(Object.values(folders).flat());
      const custom = Object.entries(folders).map(([name, keys]) => ({
        id: name,
        label: name,
        tag: name.slice(0, 3),
        deletable: true,
        items: keys.map((k) => guests.find((g) => keyOf(g) === k)).filter(Boolean),
      }));
      return [
        ...custom,
        { id: UNSORTED, label: "Unsorted", tag: "—", items: guests.filter((g) => !placed.has(keyOf(g))) },
      ];
    }
    const byNode = new Map(nodes.map((n) => [n, []]));
    for (const g of guests) {
      if (!byNode.has(g.node)) byNode.set(g.node, []);
      byNode.get(g.node).push(g);
    }
    return [...byNode.entries()].map(([node, items]) => ({ id: node, label: node, tag: node.slice(0, 5), items }));
  }, [mode, guests, folders, nodes]);

  const running = guests.filter((g) => g.status === "running").length;
  const isSelected = (g) => g.node === selectedNode && String(g.id) === String(selectedVmid);

  const addFolder = () => {
    const name = window.prompt("Folder name")?.trim();
    if (!name || folders[name] || name === UNSORTED) return;
    setFolders((prev) => ({ ...prev, [name]: [] }));
  };

  const removeFolder = (name) => {
    setFolders((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const moveTo = (folder, key) => {
    setFolders((prev) => {
      const next = Object.fromEntries(Object.entries(prev).map(([n, keys]) => [n, keys.filter((k) => k !== key)]));
      if (folder !== UNSORTED && next[folder]) next[folder] = [...next[folder], key];
      return next;
    });
  };

  return (
    <section className="panel span-12 fleet">
      <div className="panel__head">
        <span className="panel__title">Fleet</span>
        <div className="fleet__modes" role="tablist" aria-label="Group guests by">
          {[
            ["node", "Node"],
            ["type", "Type"],
            ["custom", "Folders"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              className={`fleet__mode${mode === id ? " is-active" : ""}`}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
          {mode === "custom" ? (
            <button type="button" className="btn btn--sm" onClick={addFolder}>
              + Folder
            </button>
          ) : null}
        </div>
      </div>

      {guests.length === 0 ? (
        <p className="muted">No guests found on {nodes.join(", ") || "any node"}.</p>
      ) : (
        <div className="fleet__body">
          <div className="matrix" aria-hidden="true">
            <div className="matrix__stage">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className={`matrix__col${hotGroup === g.id ? " is-hot" : ""}${hotGroup && hotGroup !== g.id ? " is-dim" : ""}`}
                >
                  <div className="matrix__dots">
                    {g.items.map((item) => (
                      <i
                        key={keyOf(item)}
                        className={`dot dot--${item.status === "running" ? "on" : "off"}${hotKey === keyOf(item) ? " is-hot" : ""}${isSelected(item) ? " is-sel" : ""}`}
                      />
                    ))}
                  </div>
                  <span className="matrix__label">{g.tag}</span>
                </div>
              ))}
            </div>
            <p className="matrix__caption">
              fleet matrix · {guests.length} guests · {running} running
            </p>
          </div>

          <ul className="fleet__groups">
            {groups.map((g) => (
              <li
                key={g.id}
                className={`fleet__group${hotGroup === g.id ? " is-hot" : ""}`}
                onMouseEnter={() => setHotGroup(g.id)}
                onMouseLeave={() => {
                  setHotGroup(null);
                  setHotKey(null);
                }}
                onDragOver={mode === "custom" ? (e) => e.preventDefault() : undefined}
                onDrop={
                  mode === "custom"
                    ? (e) => {
                        e.preventDefault();
                        moveTo(g.id, e.dataTransfer.getData("text/plain"));
                      }
                    : undefined
                }
              >
                <div className="fleet__group-head">
                  <span className="fleet__group-name">{g.label}</span>
                  <span className="fleet__tag">{g.tag}</span>
                  <span className="fleet__count">{g.items.length}</span>
                  {g.deletable ? (
                    <button type="button" className="fleet__x" aria-label={`Delete folder ${g.label}`} onClick={() => removeFolder(g.id)}>
                      ×
                    </button>
                  ) : null}
                </div>
                <div className="fleet__chips">
                  {g.items.length === 0 ? <span className="fleet__empty">{mode === "custom" ? "drop guests here" : "empty"}</span> : null}
                  {g.items.map((item) => (
                    <button
                      key={keyOf(item)}
                      type="button"
                      className={`chip chip--${item.status === "running" ? "on" : "off"}${isSelected(item) ? " is-active" : ""}`}
                      draggable={mode === "custom"}
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", keyOf(item))}
                      onMouseEnter={() => setHotKey(keyOf(item))}
                      onFocus={() => {
                        setHotGroup(g.id);
                        setHotKey(keyOf(item));
                      }}
                      onClick={() => onSelect?.(item.node, String(item.id))}
                      title={`${item.type === "lxc" ? "Container" : "VM"} ${item.id} on ${item.node} · ${item.status}`}
                    >
                      {item.name}
                      <small>
                        {item.type === "lxc" ? "CT" : "VM"} {item.id}
                      </small>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
