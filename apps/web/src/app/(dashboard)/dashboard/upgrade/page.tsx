'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { Zap, Check, Loader2, Building2, Users, FolderKanban, Cpu, Infinity } from 'lucide-react';

const FREE_FEATURES = [
  '1 Workspace',
  'Up to 3 Projects',
  'Up to 5 Members',
  '10 AI requests / day',
  'Kanban Board',
  'Wiki Docs',
  'Code Snippets',
];

const PRO_FEATURES = [
  'Unlimited Workspaces',
  'Unlimited Projects',
  'Unlimited Members',
  'Unlimited AI requests',
  'Full AI Project Assistant',
  'AI Code Reviewer',
  'Priority Support',
  'All Free features',
];

export default function UpgradePage() {
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleUpgrade = async () => {
    setIsLoading(true);
    // Placeholder: integrate Stripe Checkout here
    await new Promise((r) => setTimeout(r, 1500));
    alert('Stripe Checkout integration coming soon! Set up your STRIPE_* keys to enable payments.');
    setIsLoading(false);
  };

  if (user?.plan === 'PRO') {
    return (
      <div className="p-6 max-w-lg mx-auto animate-fade-in">
        <div className="card text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            <Zap size={28} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">You&apos;re on Pro! ⚡</h1>
          <p className="text-text-muted text-sm">
            You already have access to all DevCollab Pro features. Enjoy unlimited everything!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-full text-primary text-xs font-medium mb-4">
          <Zap size={12} />
          Upgrade to Pro
        </div>
        <h1 className="text-3xl font-bold text-text-primary mb-3">
          Everything your team needs,{' '}
          <span className="text-gradient">unlimited</span>
        </h1>
        <p className="text-text-muted max-w-md mx-auto">
          Remove all limits and unlock the full power of DevCollab&apos;s AI features for your entire team.
        </p>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
        {/* Free Plan */}
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold text-text-primary">Free</h2>
          </div>
          <div className="mb-5">
            <span className="text-3xl font-bold text-text-primary">$0</span>
            <span className="text-text-muted text-sm"> / forever</span>
          </div>
          <ul className="space-y-2.5 mb-6">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-text-secondary">
                <Check size={14} className="text-success flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <div className="btn-secondary w-full text-center justify-center opacity-60 cursor-not-allowed">
            Current Plan
          </div>
        </div>

        {/* Pro Plan */}
        <div className="card border-primary/40 bg-primary/5 relative overflow-hidden">
          <div className="absolute top-3 right-3">
            <span className="badge badge-violet text-xs">Most Popular</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={16} className="text-primary" />
            <h2 className="text-lg font-bold text-text-primary">Pro</h2>
          </div>
          <div className="mb-5">
            <span className="text-3xl font-bold text-text-primary">$12</span>
            <span className="text-text-muted text-sm"> / month</span>
          </div>
          <ul className="space-y-2.5 mb-6">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-text-secondary">
                <Check size={14} className="text-primary flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <button
            onClick={handleUpgrade}
            disabled={isLoading}
            className="btn-primary w-full justify-center"
            id="upgrade-to-pro-btn"
          >
            {isLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Zap size={14} />
            )}
            {isLoading ? 'Redirecting...' : 'Upgrade Now'}
          </button>
        </div>
      </div>

      {/* Features grid */}
      <div className="mt-12">
        <h2 className="text-xl font-bold text-text-primary text-center mb-6">What you unlock with Pro</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: <Building2 size={20} className="text-primary" />, title: 'Unlimited Workspaces', desc: 'Organize all your teams' },
            { icon: <FolderKanban size={20} className="text-secondary" />, title: 'Unlimited Projects', desc: 'No project caps ever' },
            { icon: <Users size={20} className="text-success" />, title: 'Unlimited Members', desc: 'Grow your team freely' },
            { icon: <Cpu size={20} className="text-warning" />, title: 'Full AI Access', desc: 'Unlimited AI requests' },
          ].map((feat) => (
            <div key={feat.title} className="card text-center py-5">
              <div className="w-10 h-10 rounded-xl bg-bg-elevated flex items-center justify-center mx-auto mb-3">
                {feat.icon}
              </div>
              <p className="text-sm font-semibold text-text-primary">{feat.title}</p>
              <p className="text-xs text-text-muted mt-1">{feat.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
