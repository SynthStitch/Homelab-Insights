import mongoose from "mongoose";

const { Schema } = mongoose;

// Proxmox nodes persisted after admin "Save Node" (used by dashboard/health checks)
const ProxmoxNodeSchema = new Schema(
  {
    // Display name shown in the UI
    name: { type: String, required: true, trim: true, unique: true },
    // Proxmox node identifier (e.g., pve, pve2)
    node: { type: String, required: true, trim: true },
    // Base API endpoint (https://host:8006/api2/json)
    baseUrl: { type: String, required: true, trim: true },
    // Token id/secret stored for backend Proxmox calls
    tokenId: { type: String, required: true, trim: true },
    tokenSecret: { type: String, required: true, trim: true },
    // Optional default VM to poll on this node
    defaultVmid: { type: String, trim: true },
    // Whether to reject self-signed certs
    rejectUnauthorized: { type: Boolean, default: true },
    // Audit trail of who created the node entry
    createdBy: { type: String, trim: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

ProxmoxNodeSchema.index({ node: 1 }, { unique: true });

export const ProxmoxNode =
  mongoose.models.ProxmoxNode || mongoose.model("ProxmoxNode", ProxmoxNodeSchema);
