'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import { Lock, Loader2, CheckCircle, ShieldCheck, Bell, Palette } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuthStore();

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const handleChangePassword = async () => {
    setPasswordError('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    setIsSavingPassword(true);
    try {
      await api.patch('/auth/password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordSaved(true);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPasswordSaved(false), 3000);
    } catch (err: any) {
      setPasswordError(err?.response?.data?.error || 'Failed to change password.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="text-text-muted text-sm mt-1">Manage your account security and preferences.</p>
      </div>

      {/* Account Info */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck size={16} className="text-primary" />
          <h2 className="font-semibold text-text-primary">Account Information</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">Email Address</label>
            <input
              type="email"
              value={user?.email || ''}
              className="input opacity-60 cursor-not-allowed"
              readOnly
              disabled
            />
            <p className="text-xs text-text-muted mt-1">Email cannot be changed.</p>
          </div>
          <div>
            <label className="label">Current Plan</label>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${user?.plan === 'PRO' ? 'bg-primary/20 text-primary' : 'bg-bg-elevated text-text-muted'}`}>
                {user?.plan === 'PRO' ? '⚡ Pro Plan' : '🆓 Free Plan'}
              </span>
              {user?.plan === 'FREE' && (
                <a href="/dashboard/upgrade" className="text-xs text-primary hover:underline">
                  Upgrade to Pro →
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={16} className="text-primary" />
          <h2 className="font-semibold text-text-primary">Change Password</h2>
        </div>

        {passwordError && (
          <div className="mb-4 px-4 py-3 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger">
            {passwordError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="label">Current Password</label>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              className="input"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="label">New Password</label>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              className="input"
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              className="input"
              placeholder="••••••••"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={isSavingPassword || !passwordForm.currentPassword || !passwordForm.newPassword}
            className="btn-primary"
            id="change-password-btn"
          >
            {isSavingPassword ? (
              <Loader2 size={14} className="animate-spin" />
            ) : passwordSaved ? (
              <CheckCircle size={14} />
            ) : (
              <Lock size={14} />
            )}
            {isSavingPassword ? 'Saving...' : passwordSaved ? 'Password Changed!' : 'Change Password'}
          </button>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Bell size={16} className="text-primary" />
          <h2 className="font-semibold text-text-primary">Notification Preferences</h2>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Task assignments', desc: 'When you are assigned to a task', defaultChecked: true },
            { label: 'Task updates', desc: 'When a task you own is moved or updated', defaultChecked: true },
            { label: '@Mentions', desc: 'When someone mentions you in a comment', defaultChecked: true },
            { label: 'Member joined', desc: 'When a new member joins your workspace', defaultChecked: false },
          ].map((pref) => (
            <div key={pref.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div>
                <p className="text-sm font-medium text-text-primary">{pref.label}</p>
                <p className="text-xs text-text-muted">{pref.desc}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked={pref.defaultChecked} className="sr-only peer" />
                <div className="w-9 h-5 bg-bg-elevated peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
