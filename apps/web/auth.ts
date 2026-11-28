import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { getDatabase } from "@devcollab/database";
import { randomUUID } from "node:crypto";
import { normalizeEmail, validPassword } from "@/lib/auth-input";
import { authSettings } from "@/lib/server/auth-settings";
import { allowAttempt, checkPassword } from "@/lib/server/passwords";

export class AttemptLimit extends CredentialsSignin { code = "try_later"; }

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const settings = authSettings();
  const db = settings.ready ? getDatabase() : null;
  const adapter = db ? PrismaAdapter(db) : undefined;
  if (adapter && db) {
    adapter.getUserByEmail = email => db.user.findUnique({ where: { email: normalizeEmail(email) } });
    adapter.createUser = user => {
      const email = normalizeEmail(user.email);
      if (!email) throw new Error("A valid provider email is required.");
      return db.user.create({ data: { email, name: user.name, image: user.image, emailVerified: user.emailVerified } });
    };
    // Identity is sufficient for login; DevCollab does not need provider access tokens.
    adapter.linkAccount = async ({ provider, providerAccountId, userId, type }) => {
      await db.account.create({ data: { provider, providerAccountId, userId, type } });
    };
  }
  return {
    adapter,
    trustHost:
      process.env.AUTH_TRUST_HOST === "true" ||
      Boolean(process.env.VERCEL) ||
      process.env.NODE_ENV !== "production" ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(process.env.AUTH_URL ?? ""),
    session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
    pages: { signIn: "/auth/sign-in", error: "/auth/sign-in" },
    logger: { error(error) { console.error("Authentication error", "type" in error ? error.type : error.name); } },
    providers: [
      ...(settings.google ? [Google] : []), ...(settings.github ? [GitHub] : []),
      ...(db ? [Credentials({ credentials: { email: {}, password: {} }, async authorize(input) {
        const email = normalizeEmail(input.email);
        if (!email || !validPassword(input.password)) return null;
        if (!await allowAttempt("login", email)) throw new AttemptLimit();
        const user = await db.user.findUnique({ where: { email } });
        if (!await checkPassword(input.password, user?.passwordHash ?? null) || !user) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      } })] : []),
    ],
    callbacks: {
      async jwt({ token, user }) {
        if (user && user.id) {
          const loginId = randomUUID();
          token.loginId = loginId;
          if (db) {
            const now = new Date();
            await db.session.deleteMany({ where: { userId: user.id, expires: { lt: now } } }).catch(() => {});
            await db.session.create({
              data: {
                sessionToken: loginId,
                userId: user.id,
                expires: new Date(Date.now() + 8 * 60 * 60 * 1000),
              },
            });
          }
          return token;
        }
        if (db) {
          const loginId = typeof token.loginId === "string" ? token.loginId : "";
          if (!loginId || !token.sub) return null;
          const active = await db.session.findUnique({
            where: { sessionToken: loginId },
            select: { userId: true, expires: true },
          });
          if (!active || active.expires <= new Date() || active.userId !== token.sub) {
            return null;
          }
        }
        return token;
      },
      session({ session, token }) {
        session.user.id = token.sub!;
        session.loginId = String(token.loginId ?? "");
        return session;
      },
    },
    events: {
      async signOut(message) {
        if (!db || !("token" in message) || !message.token) return;
        const loginId = typeof message.token.loginId === "string" ? message.token.loginId : "";
        if (loginId) {
          await db.session.deleteMany({ where: { sessionToken: loginId } }).catch(() => {});
        }
      },
    },
  };
});

declare module "next-auth" {
  interface Session { loginId: string }
}
