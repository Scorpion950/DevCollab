import Link from "next/link";
import { logout } from "@/app/auth/actions";
import { Button } from "./ui/button";
export function ProfileUnavailable() {
  return <main className="frame diagnostic"><h1>Profile unavailable</h1><p>Your profile could not be loaded. Refresh to try again.</p>
    <form action={logout}><Button variant="secondary">Sign out</Button></form><Link href="/app">Try again</Link></main>;
}
