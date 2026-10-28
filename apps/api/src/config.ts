import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  PASSIO_MODE: z.enum(["passio", "mock"]).default("passio"),
  PASSIO_API_KEY: z.string().optional(),
  PASSIO_BASE_URL: z.url().default("https://api.passiolife.com/v2"),
  PASSIO_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  DEMO_USER_ID: z.string().min(1).max(64).default("demo-user"),
});

export type AppConfig = {
  databaseUrl: string;
  port: number;
  passio: {
    mode: "passio" | "mock";
    apiKey: string | undefined;
    baseUrl: string;
    timeoutMs: number;
  };
  demoUserId: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    port: e.API_PORT,
    passio: {
      mode: e.PASSIO_MODE,
      apiKey: e.PASSIO_API_KEY?.trim() || undefined,
      baseUrl: e.PASSIO_BASE_URL.replace(/\/+$/, ""),
      timeoutMs: e.PASSIO_TIMEOUT_MS,
    },
    demoUserId: e.DEMO_USER_ID,
  };
}
