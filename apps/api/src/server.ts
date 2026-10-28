import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPrisma } from "./db/prisma.js";
import { createProvider } from "./recognition/providerFactory.js";

const config = loadConfig();
const prisma = createPrisma(config.databaseUrl);
const provider = createProvider(config.passio);
const app = createApp({ prisma, provider, demoUserId: config.demoUserId });

const server = app.listen(config.port, () => {
  console.info(`[api] listening on :${config.port} (recognition provider: ${provider.mode})`);
  if (provider.mode === "unconfigured") {
    console.warn("[api] PASSIO_API_KEY is not set; recognition requests will return PROVIDER_NOT_CONFIGURED.");
  }
  if (provider.mode === "mock") {
    console.warn("[api] PASSIO_MODE=mock: recognition returns labeled MOCK data, not Passio results.");
  }
});

const shutdown = () => {
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
