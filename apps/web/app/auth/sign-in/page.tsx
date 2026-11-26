import { AuthPanel } from "@/components/auth-panel";
import { authSettings } from "@/lib/server/auth-settings";
export const metadata = {title:"Sign in · DevCollab"};
export const dynamic = "force-dynamic";
export default async function SignIn({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const {error} = await searchParams;
  const message = error === "OAuthAccountNotLinked" ? "Sign in with the method originally used for this account."
    : error === "SessionRequired" ? "Please sign in again."
    : error ? "Sign-in could not be completed. Try again or choose another method." : "";
  return <AuthPanel settings={authSettings()} initialMessage={message}/>;
}
