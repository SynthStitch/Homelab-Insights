/* eslint-env node */
import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import proxmoxRoutes from "./routes/proxmox.js";
import assistantRoutes from "./routes/assistant.js";
import alertsRoutes from "./routes/alerts.js";
import "./otel.js"; // start OpenTelemetry SDK before app logic
import { authenticate, adminOnly } from "./middlewares/auth.js";
import { config } from "./config.js";
import { connectMongo } from "./db/mongo.js";
import { startProxmoxPolling } from "./services/proxmoxPoller.js";
import { ProxmoxNode } from "./models/index.js";

const app = express();

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", authenticate, adminOnly, usersRoutes);
app.use("/api/proxmox", proxmoxRoutes);
// AI assistant (OpenAI) chat endpoint
app.use("/api/assistant", assistantRoutes);
// Alerts (test endpoint for SMS/email)
app.use("/api/alerts", alertsRoutes);

// ponytail: serve the Vite build from the same process; no nginx needed
const dist = path.resolve("dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

const port = Number(process.env.PORT) || 8080;

async function bootstrapInfrastructure() {
  try {
    await connectMongo();
    await ProxmoxNode.syncIndexes(); // removes the old unique index on `node`
    startProxmoxPolling();
  } catch (err) {
    console.error("Failed to initialize infrastructure", err);
  }
}

if (process.env.NODE_ENV !== "test") {
  bootstrapInfrastructure();
}

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

export default app;
