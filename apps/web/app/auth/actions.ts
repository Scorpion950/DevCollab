"use server";
import { AuthError, CredentialsSignin } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "@devcollab/database";
import { signIn, signOut } from "@/auth";
import { authSettings } from "@/lib/server/auth-settings";
import { normalizeEmail, validPassword } from "@/lib/auth-input";
import { allowAttempt, hashPassword } from "@/lib/server/passwords";
import { safeInvitePath } from "@/lib/server/session";

export type Feedback = { message: string; email: string; name: string };
export async function registerAccount(_previous: Feedback, data: FormData) {
  return submitAuth(true, data);
}

export async function loginWithPassword(_previous: Feedback, data: FormData) {
  return submitAuth(false, data);
}

async function submitAuth(signup: boolean, data: FormData): Promise<Feedback> {
  const input = data.get("email");
  const email = normalizeEmail(input);
  const name = String(data.get("name") ?? "").trim().slice(0, 101);
  const password = data.get("password");
  const nextInvite = safeInvitePath(data.get("callbackUrl"));
  const redirectTarget = nextInvite ? `/welcome?next=${encodeURIComponent(nextInvite)}` : "/welcome";
  const fail = (message: string) => ({ message, email: typeof input === "string" ? input.slice(0, 254) : "", name });
  if (!authSettings().ready) return fail("Authentication configuration is incomplete.");
  if (!email) return fail("Enter a valid email address.");
  if (signup && (!name || name.length > 100)) return fail("Enter a name between 1 and 100 characters.");
  if (!validPassword(password)) return fail(signup ? "Use a password between 12 and 128 characters." : "Email or password is incorrect.");
  if (signup && password !== data.get("confirm")) return fail("Your passwords do not match.");
  let created = false;
  let destination: string;
  try {
    if (signup) {
      if (!await allowAttempt("register", email)) return fail("Too many attempts. Try again in 10 minutes.");
      await getDatabase().user.create({ data: { email, name, passwordHash: await hashPassword(password) }, select: { id: true } });
      created = true;
    }
    destination = await signIn("credentials", { email, password, redirect: false, redirectTo: redirectTarget });
  } catch (error) {
    if (created) return fail("Your account was created. Open Sign In to continue.");
    if (error instanceof CredentialsSignin) return fail(error.code === "try_later" ? "Too many attempts. Try again in 10 minutes." : "Email or password is incorrect.");
    if (signup && error && typeof error === "object" && "code" in error && error.code === "P2002")
      return fail("Unable to register this email. Try signing in with your original method.");
    return fail("Authentication is temporarily unavailable. Please try again.");
  }
  redirect(destination);
}
export async function startOAuth(provider: "google" | "github", data?: FormData) {
  if (!["google","github"].includes(provider) || !authSettings()[provider]) redirect("/auth/sign-in?error=Configuration");
  const nextInvite = safeInvitePath(data?.get("callbackUrl"));
  const redirectTarget = nextInvite ? `/welcome?next=${encodeURIComponent(nextInvite)}` : "/welcome";
  try { await signIn(provider, { redirectTo: redirectTarget }); }
  catch (error) {
    if (error instanceof AuthError) redirect("/auth/sign-in?error=OAuthSignin");
    throw error;
  }
}
export async function logout(data?: FormData) {
  const cookieStore = await cookies();
  cookieStore.delete("devcollab.active.org");
  const nextInvite = safeInvitePath(data?.get("callbackUrl"));
  const redirectTo = nextInvite
    ? `/auth/sign-in?callbackUrl=${encodeURIComponent(nextInvite)}`
    : "/auth/sign-in";
  await signOut({ redirectTo });
}
