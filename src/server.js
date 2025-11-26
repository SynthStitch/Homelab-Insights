/* eslint-env node */
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import proxmoxRoutes from "./routes/proxmox.js";
import { authenticate, adminOnly } from "./middlewares/auth.js";
import { config } from "./config.js";
import { connectMongo } from "./db/mongo.js";
import { startProxmoxPolling } from "./services/proxmoxPoller.js";

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

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

const port = Number(process.env.PORT) || 8080;

async function bootstrapInfrastructure() {
  try {
    await connectMongo();
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
