import Joi from "joi";
import { ProxmoxSnapshot } from "../models/index.js";
import { isSmsEnabled, isEmailEnabled, sendSmsAlert, sendEmailAlert } from "../services/notificationService.js";

const testSchema = Joi.object({
  phone: Joi.string().allow("", null),
  email: Joi.string().email({ tlds: { allow: false } }).allow("", null),
  cpuThreshold: Joi.number().min(1).max(100).default(80),
});

const E164 = /^\+[1-9]\d{6,14}$/; // simple E.164 check

function buildAlertMessage(snapshot, cpuThreshold) {
  if (!snapshot) {
    return `Homelab Insights alert test: no snapshots available; CPU threshold ${cpuThreshold}%`;
  }
  const mem = snapshot.memory || {};
  const memText =
    mem.max && mem.used
      ? `mem=${Math.round((mem.used / mem.max) * 10000) / 100}% (${(mem.used / 1024 ** 3).toFixed(2)}GB/${(mem.max / 1024 ** 3).toFixed(2)}GB)`
      : "mem=n/a";
  const cpuText = snapshot.cpuPercent !== undefined ? `cpu=${snapshot.cpuPercent}%` : "cpu=n/a";
  return `Homelab Insights alert test: node=${snapshot.node}, vmid=${snapshot.vmid}, ${cpuText}, ${memText}, threshold=${cpuThreshold}%`;
}

export async function sendTestAlert(req, res) {
  const { error, value } = testSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  if (!value.phone && !value.email) {
    return res.status(400).json({ error: "Provide at least a phone or email to send a test alert." });
  }

  if (value.phone && !E164.test(value.phone)) {
    return res.status(400).json({ error: "Phone must be E.164 format, e.g., +19523958985." });
  }

  // Grab the latest snapshot to include in the alert body, if present.
  const latestSnapshot = await ProxmoxSnapshot.findOne().sort({ collectedAt: -1 }).lean();
  const message = buildAlertMessage(latestSnapshot, value.cpuThreshold);

  try {
    if (value.phone) {
      if (!isSmsEnabled()) {
        return res.status(503).json({ error: "SMS is not configured." });
      }
      await sendSmsAlert({ to: value.phone, body: message });
    }

    if (value.email) {
      if (!isEmailEnabled()) {
        return res.status(503).json({ error: "Email is not configured." });
      }
      await sendEmailAlert({ to: value.email, subject: "Homelab Insights Alert Test", text: message });
    }

    return res.json({ ok: true, message: "Test alert sent." });
  } catch (err) {
    console.error("Test alert failed", err);
    const status = err?.status || err?.statusCode || 502;
    return res
      .status(status)
      .json({ error: "Failed to send alert.", details: err?.message, code: err?.code });
  }
}
