import { getNodeExporterSnapshot, getCadvisorContainers } from "../services/exporters.js";

export async function getSnapshot(req, res, next) {
  try {
    const [nodes, containers] = await Promise.all([
      getNodeExporterSnapshot(),
      getCadvisorContainers(),
    ]);
    res.json({ nodes, containers, ts: Date.now() });
  } catch (err) {
    next(err);
  }
}

