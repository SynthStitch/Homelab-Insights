import Joi from "joi";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { findUserByIdentifier } from "../services/userStore.js";

const signinSchema = Joi.object({
  identifier: Joi.string().min(2).required(),
  password: Joi.string().min(4).required(),
});

export async function signin(req, res, next) {
  try {
    const { error, value } = signinSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    const identifier = value.identifier.trim();
    const user = await findUserByIdentifier(identifier);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const passwordHash = user.passwordHash || user.password;
    if (!passwordHash) {
      return res.status(500).json({ error: "User record is missing credentials" });
    }

    const isHash = typeof passwordHash === "string" && passwordHash.startsWith("$2");
    const passwordsMatch = isHash
      ? await bcrypt.compare(value.password, passwordHash)
      : value.password === passwordHash;
    if (!passwordsMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        sub: user.id ?? user._id?.toString() ?? user.username,
        role: user.role ?? "viewer",
        username: user.username,
        email: user.email ?? undefined,
        allowedVmIds: Array.isArray(user.allowedVmIds) ? user.allowedVmIds : [],
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
    return res.json({ token });
  } catch (err) {
    next(err);
  }
}
