import mongoose from "mongoose";

const { Schema } = mongoose;

// Generic key/value settings (integrations, feature flags). One document per key.
const SettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true, versionKey: false },
);

export const Setting = mongoose.models.Setting || mongoose.model("Setting", SettingSchema);
