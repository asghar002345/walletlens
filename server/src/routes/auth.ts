import { Router, type CookieOptions, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/user.js";
import { loginSchema, registerSchema } from "../validation.js";
import { HttpError } from "../middleware/errors.js";
import { COOKIE_NAME, requireAuth } from "../middleware/auth.js";
import type { AppConfig } from "../config.js";

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export function authRouter(config: AppConfig) {
  const router = Router();
  const cookieOpts: CookieOptions = { httpOnly: true, sameSite: "lax", secure: config.secureCookies, path: "/" };

  const startSession = (res: Response, userId: string) => {
    const token = jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: "7d" });
    res.cookie(COOKIE_NAME, token, { ...cookieOpts, maxAge: SESSION_MS });
  };

  router.post("/register", async (req, res) => {
    const { name, email, password } = registerSchema.parse(req.body);
    if (await User.exists({ email })) throw new HttpError(409, "Email is already registered");
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
    startSession(res, user.id);
    res.status(201).json({ user });
  });

  router.post("/login", async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await User.findOne({ email }).select("+passwordHash");
    // Same message for unknown email and wrong password, so emails can't be enumerated.
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }
    startSession(res, user.id);
    res.json({ user });
  });

  router.post("/logout", (_req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOpts);
    res.status(204).end();
  });

  router.get("/me", requireAuth(config.jwtSecret), async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) throw new HttpError(401, "Not authenticated");
    res.json({ user });
  });

  return router;
}
