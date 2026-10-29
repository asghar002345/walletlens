import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { HttpError } from "./errors.js";

export const COOKIE_NAME = "token";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

export function requireAuth(jwtSecret: string): RequestHandler {
  return (req, _res, next) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return next(new HttpError(401, "Not authenticated"));
    try {
      const payload = jwt.verify(token, jwtSecret) as { sub: string };
      req.userId = payload.sub;
      next();
    } catch {
      next(new HttpError(401, "Invalid or expired session"));
    }
  };
}
