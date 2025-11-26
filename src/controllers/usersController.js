import Joi from "joi";
import {
  listUsers as listUsersStore,
  createUser as createUserStore,
  updateUser as updateUserStore,
  deleteUser as deleteUserStore,
} from "../services/userStore.js";

const emailField = Joi.string().email({ tlds: { allow: false } }).allow("", null);

const sanitizeVmArray = (value) =>
  Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean) : [];

const createSchema = Joi.object({
  username: Joi.string().min(2).required(),
  password: Joi.string().min(4).required(),
  email: emailField.optional(),
  role: Joi.string().valid("viewer", "admin").default("viewer"),
  allowedVmIds: Joi.array().items(Joi.string().trim()).default([]),
});

const updateSchema = Joi.object({
  username: Joi.string().min(2),
  password: Joi.string().min(4),
  email: emailField,
  role: Joi.string().valid("viewer", "admin"),
  allowedVmIds: Joi.array().items(Joi.string().trim()),
}).min(1);

function toPublicUser(user) {
  const { passwordHash: _passwordHash, password: _password, ...rest } = user;
  return rest;
}

export async function listUsers(req, res, next) {
  try {
    const users = await listUsersStore();
    res.json({ users: users.map(toPublicUser) });
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  try {
    const { error, value } = createSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    const payload = {
      ...value,
      allowedVmIds: sanitizeVmArray(value.allowedVmIds),
      email: typeof value.email === "string" ? value.email.trim() || undefined : value.email,
    };
    const user = await createUserStore(payload);
    res.status(201).json({ user: toPublicUser(user) });
  } catch (err) {
    if (err.message === "Username already exists" || err.message === "Email already in use") {
      return res.status(409).json({ error: err.message });
    }
    next(err);
  }
}

export async function updateUser(req, res, next) {
  try {
    const { error, value } = updateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    const payload = { ...value };
    if (Object.prototype.hasOwnProperty.call(payload, "email")) {
      payload.email =
        typeof payload.email === "string" ? payload.email.trim() || undefined : payload.email;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "allowedVmIds")) {
      payload.allowedVmIds = sanitizeVmArray(payload.allowedVmIds);
    }
    const user = await updateUserStore(req.params.username, payload);
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    if (err.message === "User not found") {
      return res.status(404).json({ error: err.message });
    }
    if (err.message === "Username already exists" || err.message === "Email already in use") {
      return res.status(409).json({ error: err.message });
    }
    next(err);
  }
}

export async function deleteUser(req, res, next) {
  try {
    const removed = await deleteUserStore(req.params.username);
    if (!removed) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
