import { AuthPanel } from "@/components/auth-panel";
import { authSettings } from "@/lib/server/auth-settings";
export const metadata = {title:"Create an account · DevCollab"};
export const dynamic = "force-dynamic";
export default function SignUp(){return <AuthPanel signup settings={authSettings()}/>;}
