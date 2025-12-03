import { Router } from "express";
import Joi from "joi";
import { authenticate } from "../middlewares/auth.js";
import { getAssistantReply, isAssistantAvailable } from "../services/assistantClient.js";
import { ProxmoxSnapshot, ProxmoxNode } from "../models/index.js";

const router = Router();

const requestSchema = Joi.object({
  message: Joi.string().min(1).max(1000).required(),
  context: Joi.string().allow("").max(4000).default(""),
});

// Build a small, safe context from Mongo (latest node/vm snapshots + saved nodes).
async function buildAssistantContext() {
  const nodes = await ProxmoxNode.find()
    .select("name node defaultVmid")
    .sort({ name: 1 })
    .lean();

  const snaps = await ProxmoxSnapshot.find()
    .select("node vmid status cpuPercent memory collectedAt")
    .sort({ collectedAt: -1 })
    .limit(12)
    .lean();

  const nodeLines =
    nodes.length > 0
      ? nodes.map((n) => `- ${n.name || n.node} (node=${n.node}, defaultVmid=${n.defaultVmid || "n/a"})`).join("\n")
      : "No saved nodes.";

  const snapLines =
    snaps.length > 0
      ? snaps.map((s) => {
          const mem = s.memory || {};
          const memText =
            mem.max && mem.used
              ? `mem=${Math.round((mem.used / mem.max) * 10000) / 100}% (${(mem.used / 1024 ** 3).toFixed(2)}GB/${(mem.max / 1024 ** 3).toFixed(2)}GB)`
              : "mem=n/a";
          const cpuText = s.cpuPercent !== undefined ? `cpu=${s.cpuPercent}%` : "cpu=n/a";
          const when = s.collectedAt ? new Date(s.collectedAt).toISOString() : "unknown time";
          return `- node=${s.node}, vmid=${s.vmid}, status=${s.status || "unknown"}, ${cpuText}, ${memText}, at ${when}`;
        }).join("\n")
      : "No recent snapshots.";

  return `Nodes:\n${nodeLines}\n\nRecent snapshots:\n${snapLines}`;
}

router.post("/chat", authenticate, async (req, res) => {
  if (!isAssistantAvailable()) {
    return res.status(503).json({ error: "AI assistant is not configured." });
  }

  const { error, value } = requestSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.message });
  }

  let contextText = value.context || "";
  if (!contextText) {
    try {
      contextText = await buildAssistantContext();
    } catch (err) {
      console.error("Assistant context build failed", err);
      contextText = "";
    }
  }

  try {
    const reply = await getAssistantReply({
      message: value.message,
      context: contextText,
    });
    return res.json({ reply });
  } catch (err) {
    console.error("Assistant chat failed", err);
    return res.status(502).json({ error: "Failed to contact AI assistant." });
  }
});

export default router;
