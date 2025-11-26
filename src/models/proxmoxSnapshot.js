import mongoose from "mongoose";

const { Schema } = mongoose;

const MemorySchema = new Schema(
  {
    used: { type: Number },
    free: { type: Number },
    max: { type: Number },
  },
  { _id: false }
);

const ProxmoxSnapshotSchema = new Schema(
  {
    node: { type: String, required: true, index: true },
    vmid: { type: String, required: true, index: true },
    status: { type: String },
    cpuPercent: { type: Number },
    memory: { type: MemorySchema },
    uptimeSeconds: { type: Number },
    raw: { type: Schema.Types.Mixed },
    collectedAt: { type: Date, default: Date.now, index: true },
  },
  {
    versionKey: false,
  }
);

ProxmoxSnapshotSchema.index({ node: 1, vmid: 1, collectedAt: -1 });

export const ProxmoxSnapshot =
  mongoose.models.ProxmoxSnapshot ||
  mongoose.model("ProxmoxSnapshot", ProxmoxSnapshotSchema);
