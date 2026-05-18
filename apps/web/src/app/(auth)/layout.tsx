import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your DevCollab account.',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-base bg-grid flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-hero-glow pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-secondary/5 rounded-full blur-3xl pointer-events-none" />

      {/* Logo */}
      <div className="absolute top-6 left-8 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center">
          <span className="text-white font-bold text-sm">D</span>
        </div>
        <span className="font-semibold text-text-primary">DevCollab</span>
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {children}
      </div>
    </div>
  );
}
