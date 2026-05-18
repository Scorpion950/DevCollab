'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, ArrowRight, Check } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

const PASSWORD_RULES = [
  { label: '8+ characters', test: (p: string) => p.length >= 8 },
  { label: 'Uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Number', test: (p: string) => /[0-9]/.test(p) },
];

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await register(form.name, form.email, form.password);
      router.push('/dashboard');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Registration failed. Please try again.');
    }
  };

  const passwordStrength = PASSWORD_RULES.filter((r) =>
    r.test(form.password)
  ).length;
  const strengthColors = ['bg-danger', 'bg-warning', 'bg-success'];

  return (
    <div className="card-elevated animate-scale-in">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🚀</span>
        </div>
        <h1 className="text-2xl font-bold text-text-primary mb-1">Create your account</h1>
        <p className="text-text-secondary text-sm">
          Free forever — no credit card required
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger animate-slide-up">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="label">Full name</label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Ankush Kumar"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
            required
            minLength={2}
          />
        </div>

        <div>
          <label htmlFor="email" className="label">Email address</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="input"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="label">Password</label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Create a strong password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="input pr-10"
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Password strength */}
          {form.password && (
            <div className="mt-2 space-y-1.5 animate-slide-up">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                      i < passwordStrength
                        ? strengthColors[passwordStrength - 1]
                        : 'bg-border'
                    }`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {PASSWORD_RULES.map((rule) => (
                  <span
                    key={rule.label}
                    className={`flex items-center gap-1 text-xs transition-colors ${
                      rule.test(form.password)
                        ? 'text-success'
                        : 'text-text-muted'
                    }`}
                  >
                    <Check size={10} />
                    {rule.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full justify-center mt-2"
          id="register-submit-btn"
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              Create account
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-text-muted">
        By signing up, you agree to our{' '}
        <Link href="/terms" className="text-primary hover:underline">Terms</Link>
        {' '}and{' '}
        <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
      </p>

      {/* Divider */}
      <div className="mt-6 pt-6 border-t border-border text-center">
        <p className="text-text-muted text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:text-primary-light font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
