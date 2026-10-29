export interface AppConfig {
  jwtSecret: string;
  clientOrigin: string;
  secureCookies: boolean;
}

export function loadConfig(env = process.env): AppConfig {
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 16) throw new Error("JWT_SECRET must be set (min 16 chars)");
  return {
    jwtSecret,
    clientOrigin: env.CLIENT_ORIGIN ?? "http://localhost:5173",
    secureCookies: env.NODE_ENV === "production",
  };
}
