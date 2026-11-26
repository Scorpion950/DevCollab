import Link from "next/link";
import { Button } from "./ui/button";

export function PublicIntro({label,title,accent,description}:{label:string;title:string;accent:string;description:string}) {
  return <header className="public-intro"><p className="eyebrow"><span className="index-mark"/>{label}</p>
    <h1>{title}<br/><em>{accent}</em></h1><p>{description}</p></header>;
}

export function StartCTA() {
  return <section className="start-cta"><h2>Ready to build differently?</h2><Button asChild><Link href="/auth/sign-in">Get Started</Link></Button></section>;
}
