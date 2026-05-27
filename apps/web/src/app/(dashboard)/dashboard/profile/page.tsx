'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import api from '@/lib/api';
import { User, Camera, Github, Link, FileText, Tag, Loader2, CheckCircle } from 'lucide-react';
import Image from 'next/image';

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: user?.name || '',
    bio: user?.bio || '',
    githubUrl: user?.githubUrl || '',
    skills: (user?.skills || []).join(', '),
  });

  const avatarUrl =
    user?.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=7C3AED&color=fff&bold=true`;

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    setSaved(false);
    try {
      const { data } = await api.patch('/auth/profile', {
        name: form.name,
        bio: form.bio,
        githubUrl: form.githubUrl || undefined,
        skills: form.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setUser(data.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">My Profile</h1>
        <p className="text-text-muted text-sm mt-1">
          Update your personal information visible to your team.
        </p>
      </div>

      {/* Avatar */}
      <div className="card mb-6 flex items-center gap-5">
        <div className="relative">
          <Image
            src={avatarUrl}
            alt={user?.name || 'User'}
            width={72}
            height={72}
            className="avatar w-18 h-18 rounded-full"
          />
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center border-2 border-bg-surface cursor-pointer">
            <Camera size={10} className="text-white" />
          </div>
        </div>
        <div>
          <p className="font-semibold text-text-primary">{user?.name}</p>
          <p className="text-sm text-text-muted">{user?.email}</p>
          <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full ${user?.plan === 'PRO' ? 'bg-primary/20 text-primary' : 'bg-bg-elevated text-text-muted'}`}>
            {user?.plan === 'PRO' ? '⚡ Pro' : 'Free Plan'}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger">
          {error}
        </div>
      )}

      <div className="card space-y-5">
        <div>
          <label className="label flex items-center gap-2">
            <User size={13} /> Display Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
            placeholder="Your full name"
            maxLength={50}
          />
        </div>

        <div>
          <label className="label flex items-center gap-2">
            <FileText size={13} /> Bio
          </label>
          <textarea
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            className="input resize-none h-24"
            placeholder="Tell your team a bit about yourself..."
            maxLength={300}
          />
          <p className="text-xs text-text-muted mt-1 text-right">{form.bio.length}/300</p>
        </div>

        <div>
          <label className="label flex items-center gap-2">
            <Tag size={13} /> Skills
          </label>
          <input
            type="text"
            value={form.skills}
            onChange={(e) => setForm({ ...form, skills: e.target.value })}
            className="input"
            placeholder="React, TypeScript, Node.js (comma-separated)"
          />
        </div>

        <div>
          <label className="label flex items-center gap-2">
            <Github size={13} /> GitHub URL
          </label>
          <input
            type="url"
            value={form.githubUrl}
            onChange={(e) => setForm({ ...form, githubUrl: e.target.value })}
            className="input"
            placeholder="https://github.com/yourusername"
          />
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary"
            id="save-profile-btn"
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : saved ? (
              <CheckCircle size={14} />
            ) : null}
            {isSaving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>
          {saved && (
            <p className="text-sm text-success flex items-center gap-1">
              <CheckCircle size={13} /> Profile updated
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
