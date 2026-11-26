import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity } from "lucide-react";
import { getApiHealth } from "@/lib/server/api";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "API diagnostic · DevCollab", robots: { index: false } };

export default async function HealthDiagnostic() {
  if (process.env.NODE_ENV !== "development") notFound();
  const result = await getApiHealth();
  return (
    <main className="frame diagnostic">
      <p className="eyebrow"><Activity size={16} /> Development diagnostic</p>
      <h1>API connectivity</h1>
      <div className="panel diagnostic-result" role="status">
        <h2>{result.ok ? "Connected" : "Unavailable"}</h2>
        <p>{result.ok ? `${result.data.service} returned “${result.data.status}”.` : result.message}</p>
      </div>
      <Button asChild variant="secondary"><a href="/dev/health">Check again</a></Button>
      <Button asChild><Link href="/">Back to DevCollab</Link></Button>
    </main>
  );
}
