import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { getDatabase } from "@devcollab/database";

const options = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
export const hashPassword = (password: string) => hash(password, options);
let dummyHash: Promise<string> | undefined;
export async function checkPassword(password: string, stored: string | null) {
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
  const matches = await verify(stored ?? await dummyHash, password);
  return Boolean(stored && matches);
}

// Shared across serverless instances. Only keyed digests of identifiers are stored.
export async function allowAttempt(kind: "login" | "register", email: string) {
  const db = getDatabase();
  const digest = createHmac("sha256", process.env.AUTH_SECRET!).update(email).digest("hex");
  async function increment(key: string, limit: number) {
    const count = await db.$executeRaw`INSERT INTO "AuthAttempt" ("key","count","expires")
      VALUES (${key},1,NOW() + INTERVAL '10 minutes')
      ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "AuthAttempt"."expires" <= NOW() THEN 1 ELSE "AuthAttempt"."count"+1 END,
      "expires" = CASE WHEN "AuthAttempt"."expires" <= NOW() THEN EXCLUDED."expires" ELSE "AuthAttempt"."expires" END
      WHERE "AuthAttempt"."expires" <= NOW() OR "AuthAttempt"."count" < ${limit}`;
    return count === 1;
  }
  if (!await increment(kind + ":all", kind === "login" ? 1000 : 150)) return false;
  await db.authAttempt.deleteMany({ where: { expires: { lt: new Date() } } });
  return increment(kind + ":" + digest, kind === "login" ? 12 : 5);
}
