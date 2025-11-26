import bcrypt from "bcryptjs";
import { User } from "../models/user.js";

function sanitizeVmIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const list = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    list.push(trimmed);
  }
  return list;
}

const DEFAULT_ADMIN = {
  username: "admin",
  email: "admin@homelab.local",
  role: "admin",
  allowedVmIds: ["*"],
  password: "change-me",
};

let seedPromise = null;

async function ensureDefaultAdmin() {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const exists = await User.exists({ username: DEFAULT_ADMIN.username });
    if (!exists) {
      const passwordHash = bcrypt.hashSync(DEFAULT_ADMIN.password, 10);
      await User.create({
        username: DEFAULT_ADMIN.username,
        email: DEFAULT_ADMIN.email,
        role: DEFAULT_ADMIN.role,
        allowedVmIds: DEFAULT_ADMIN.allowedVmIds,
        passwordHash,
      });
      console.log("Seeded default admin user (username: admin, password: change-me)");
    }
  })().catch((err) => {
    seedPromise = null;
    throw err;
  });
  return seedPromise;
}

function normalizeEmail(email) {
  if (typeof email !== "string") return undefined;
  const trimmed = email.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

export async function listUsers() {
  await ensureDefaultAdmin();
  const docs = await User.find().lean().exec();
  return docs;
}

export async function findUserByIdentifier(identifier) {
  await ensureDefaultAdmin();
  if (!identifier) return null;
  const direct = await User.findOne({ username: identifier }).exec();
  if (direct) return direct;
  const lowered = identifier.toLowerCase();
  return User.findOne({ email: lowered }).exec();
}

export async function createUser({
  username,
  password,
  passwordHash,
  role = "viewer",
  email,
  allowedVmIds = [],
}) {
  await ensureDefaultAdmin();
  if (!username) throw new Error("Username is required");

  const existingUsername = await User.exists({ username });
  if (existingUsername) {
    throw new Error("Username already exists");
  }

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const existingEmail = await User.exists({ email: normalizedEmail });
    if (existingEmail) {
      throw new Error("Email already in use");
    }
  }

  const hash =
    passwordHash ??
    (typeof password === "string"
      ? bcrypt.hashSync(password, 10)
      : (() => {
          throw new Error("Either password or passwordHash must be provided");
        })());

  const doc = await User.create({
    username,
    email: normalizedEmail ?? undefined,
    passwordHash: hash,
    role,
    allowedVmIds: sanitizeVmIds(allowedVmIds),
  });

  return doc.toObject();
}

export async function updateUser(username, updates = {}) {
  await ensureDefaultAdmin();
  const existing = await User.findOne({ username }).exec();
  if (!existing) {
    throw new Error("User not found");
  }

  const next = {};

  if (typeof updates.username === "string" && updates.username !== username) {
    const trimmed = updates.username.trim();
    if (!trimmed) throw new Error("Username already exists");
    const conflict = await User.exists({ username: trimmed });
    if (conflict) {
      throw new Error("Username already exists");
    }
    next.username = trimmed;
  }

  if (typeof updates.role === "string") {
    next.role = updates.role;
  }

  if (Array.isArray(updates.allowedVmIds)) {
    next.allowedVmIds = sanitizeVmIds(updates.allowedVmIds);
  }

  if (typeof updates.email !== "undefined") {
    const normalizedEmail = normalizeEmail(updates.email);
    if (normalizedEmail) {
      const conflict = await User.exists({
        email: normalizedEmail,
        username: { $ne: existing.username },
      });
      if (conflict) {
        throw new Error("Email already in use");
      }
      next.email = normalizedEmail;
    } else {
      next.email = null;
    }
  }

  if (typeof updates.password === "string" && updates.password) {
    next.passwordHash = bcrypt.hashSync(updates.password, 10);
  } else if (typeof updates.passwordHash === "string") {
    next.passwordHash = updates.passwordHash;
  }

  if (Object.keys(next).length === 0) {
    return existing.toObject();
  }

  const updated = await User.findByIdAndUpdate(existing._id, next, {
    new: true,
    runValidators: true,
    overwrite: false,
  }).exec();

  return updated.toObject();
}

export async function deleteUser(username) {
  await ensureDefaultAdmin();
  const result = await User.deleteOne({ username }).exec();
  return result.deletedCount > 0;
}
