import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Global cache for primary (local) database
const globalForPrisma = globalThis as unknown as { 
  prisma?: PrismaClient;
  cloudPrisma?: PrismaClient | null;
};

function createLocalClient() {
  const connectionString =
    process.env.RESTAURANTSEVEN02_DATABASE_URL_POOLED ??
    process.env.RESTAURANTSEVEN02_DATABASE_URL ??
    process.env.RESTAURANTSEVEN02_PRISMA_DATABASE_URL ??
    process.env.RESTAURANTSEVEN02_POSTGRES_URL ??
    process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Set RESTAURANTSEVEN02_DATABASE_URL_POOLED or DATABASE_URL.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createLocalClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Dedicated client for Vercel/Cloud sync if configured
export function getCloudDb(): PrismaClient | null {
  const cloudUrl = process.env.CLOUD_DATABASE_URL;
  if (!cloudUrl || cloudUrl === process.env.DATABASE_URL) {
    return null;
  }
  if (!globalForPrisma.cloudPrisma) {
    try {
      const adapter = new PrismaPg({ connectionString: cloudUrl });
      globalForPrisma.cloudPrisma = new PrismaClient({ adapter });
    } catch (err) {
      console.warn("Could not initialize cloud database connection", err);
      return null;
    }
  }
  return globalForPrisma.cloudPrisma;
}
