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
    session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
    pages: { signIn: "/auth/sign-in", error: "/auth/sign-in" },
    logger: { error(error) { console.error("Authentication error", error.name); } },
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
      jwt({ token, user }) {
        if (user) token.loginId = randomUUID();
        return token;
      },
      session({ session, token }) {
        session.user.id = token.sub!;
        session.loginId = String(token.loginId ?? "");
        return session;
      },
    },
  };
});

declare module "next-auth" {
  interface Session { loginId: string }
}
