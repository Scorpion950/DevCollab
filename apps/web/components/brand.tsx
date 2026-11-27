import Link from "next/link";
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 34 32" fill="currentColor" className={className}>
      <path d="M13 2h9L10 24H1zM24 8h9L21 30h-9z" />
    </svg>
  );
}

export function Wordmark({ href = "/", onNavigate }: { href?: string; onNavigate?: () => void }) {
  return <Link onClick={onNavigate} href={href} aria-label="DevCollab home" className="wordmark"><BrandMark />DevCollab</Link>;
}
