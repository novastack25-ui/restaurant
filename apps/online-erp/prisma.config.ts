import "dotenv/config";
import { defineConfig } from "prisma/config";
import { normalizeDatabaseUrl } from "./database-url";

const connectionString =
  process.env.RESTAURANTSEVEN02_PRISMA_DATABASE_URL ??
  process.env.RESTAURANTSEVEN02_DATABASE_URL ??
  process.env.RESTAURANTSEVEN02_POSTGRES_URL ??
  process.env.DATABASE_URL ??
  process.env.RESTAURANTSEVEN02_DATABASE_URL_POOLED ??
  "postgresql://postgres:postgres@localhost:5432/restaurant_erp";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: {
    url: normalizeDatabaseUrl(connectionString),
  },
});
