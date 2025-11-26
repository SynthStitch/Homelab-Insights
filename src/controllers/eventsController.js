import { attachSse, broadcastSse } from "../services/sseHub.js";

const events = [
  { ts: Date.now() - 172800000, kind: "warning", msg: "VM web-01 high CPU (95%)" },
  { ts: Date.now() - 86400000, kind: "alert", msg: "db-02 mem leak suspected" },
];

export function listEvents(req, res) {
  res.json({ events });
}

export function streamEvents(req, res) {
  attachSse(req, res);
}

export function createEvent(req, res) {
  const evt = {
    ts: Date.now(),
    kind: req.body?.kind || "info",
    msg: req.body?.msg || "ok",
  };
  events.unshift(evt);
  broadcastSse("event", evt);
  res.status(201).json({ ok: true });
}

