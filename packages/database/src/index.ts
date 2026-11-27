import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export * from "./generated/prisma/enums.js";
export type { PrismaClient };
export { Prisma } from "./generated/prisma/client.js";

const cache = globalThis as typeof globalThis & { devCollabPrisma?: PrismaClient };
let client: PrismaClient | undefined;

export function getDatabase(): PrismaClient {
  const existing = client ?? cache.devCollabPrisma;
  if (existing) return existing;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Set DATABASE_URL to the pooled Neon connection URL.");
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 10000 }) });
  if (process.env.NODE_ENV !== "production") cache.devCollabPrisma = client;
  return client;
}
