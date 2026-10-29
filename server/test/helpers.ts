import { createApp } from "../src/app.js";
export const testConfig = {
  jwtSecret: "test-secret-at-least-16",
  clientOrigin: "http://localhost:5173",
  secureCookies: false,
};
export const makeApp = (overrides = {}) => createApp({ ...testConfig, ...overrides });
