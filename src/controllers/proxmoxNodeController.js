import Joi from "joi";
import { ProxmoxNode } from "../models/proxmoxNode.js";
import { testProxmoxCredentials } from "../services/proxmoxTestClient.js";

const testSchema = Joi.object({
  name: Joi.string().min(2).optional(), // allow name through tests to avoid "name is not allowed"
  baseUrl: Joi.string().uri({ scheme: [/https?/] }).required(),
  tokenId: Joi.string().min(3).required(),
  tokenSecret: Joi.string().min(6).required(),
  node: Joi.string().min(1).required(),
  defaultVmid: Joi.string().allow("", null),
  rejectUnauthorized: Joi.boolean().default(true),
});

const createSchema = testSchema.keys({
  name: Joi.string().min(2).required(),
});

function sanitize(nodeDoc) {
  if (!nodeDoc) return null;
  const obj = nodeDoc.toObject ? nodeDoc.toObject() : nodeDoc;
  const { tokenSecret: _tokenSecret, __v, ...rest } = obj; // strip secrets/version fields
  return rest;
}

export async function testNodeConnection(req, res) {
  const { error, value } = testSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  try {
    const result = await testProxmoxCredentials({
      baseUrl: value.baseUrl,
      tokenId: value.tokenId,
      tokenSecret: value.tokenSecret,
      node: value.node,
      rejectUnauthorized: value.rejectUnauthorized,
      vmid: value.defaultVmid || undefined,
      signal: req.signal,
    });
    return res.json({ ok: true, result });
  } catch (err) {
    const status = err.status && Number.isInteger(err.status) ? err.status : 502;
    const payload = { ok: false, error: err.message };
    if (err.body) payload.details = err.body;
    return res.status(status).json(payload);
  }
}

export async function createNode(req, res) {
  const { error, value } = createSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.message });
  }

  const existing = await ProxmoxNode.findOne({
    $or: [{ name: value.name }, { node: value.node }],
  }).lean();
  if (existing) {
    return res
      .status(409)
      .json({ error: "A node with this name or node identifier already exists." });
  }

  try {
    await testProxmoxCredentials({
      baseUrl: value.baseUrl,
      tokenId: value.tokenId,
      tokenSecret: value.tokenSecret,
      node: value.node,
      rejectUnauthorized: value.rejectUnauthorized,
      vmid: value.defaultVmid || undefined,
      signal: req.signal,
    });
  } catch (err) {
    const status = err.status && Number.isInteger(err.status) ? err.status : 502;
    const payload = { error: `Node test failed: ${err.message}` };
    if (err.body) payload.details = err.body;
    return res.status(status).json(payload);
  }

  const created = await ProxmoxNode.create({
    name: value.name,
    node: value.node,
    baseUrl: value.baseUrl,
    tokenId: value.tokenId,
    tokenSecret: value.tokenSecret,
    defaultVmid: value.defaultVmid || undefined,
    rejectUnauthorized: value.rejectUnauthorized,
    createdBy: req.user?.username,
  });

  return res.status(201).json({ node: sanitize(created) });
}

export async function listNodes(req, res) {
  const nodes = await ProxmoxNode.find().sort({ name: 1 }).lean();
  res.json({ nodes: nodes.map(sanitize) });
}

// DELETE /api/proxmox/nodes/:name - remove a saved node config
export async function deleteNode(req, res) {
  const name = req.params.name;
  const removed = await ProxmoxNode.findOneAndDelete({ name }).lean();
  if (!removed) {
    return res.status(404).json({ error: "Node not found" });
  }
  return res.status(204).end();
}

export async function pingStoredNode(req, res) {
  const name = req.params.name;
  const doc = await ProxmoxNode.findOne({ name }).lean();
  if (!doc) {
    return res.status(404).json({ error: "Node not found" });
  }
  try {
    const result = await testProxmoxCredentials({
      baseUrl: doc.baseUrl,
      tokenId: doc.tokenId,
      tokenSecret: doc.tokenSecret,
      node: doc.node,
      rejectUnauthorized: doc.rejectUnauthorized,
      vmid: doc.defaultVmid || undefined,
      signal: req.signal,
    });
    return res.json({ ok: true, result: { node: doc.node, vmCount: result.vmCount } });
  } catch (err) {
    const status = err.status && Number.isInteger(err.status) ? err.status : 502;
    return res.status(status).json({ ok: false, error: err.message });
  }
}
