import { getDatabase } from "./index.js";

async function check() {
  const database = getDatabase();
  try {
    await database.$queryRaw`SELECT 1`;
    console.info("PostgreSQL connection verified.");
  } finally {
    await database.$disconnect();
  }
}

check().catch(() => {
  console.error("Database check failed. Verify DATABASE_URL and connectivity to Neon.");
  process.exitCode = 1;
});
