'use client';

import { Bell, Search, LogOut, User, Settings, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

export function Topbar() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const avatarUrl = user?.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=7C3AED&color=fff&bold=true`;

  return (
    <header
      className="flex items-center justify-between px-6 border-b border-border bg-bg-surface flex-shrink-0"
      style={{ height: 'var(--topbar-height)' }}
    >
      {/* Search */}
      <div className="flex items-center gap-2 flex-1 max-w-xs">
        <div className="flex items-center gap-2 w-full px-3 py-1.5 bg-bg-elevated border border-border rounded-lg text-sm text-text-muted hover:border-border-strong transition-colors cursor-pointer group">
          <Search size={14} />
          <span className="flex-1 text-xs">Search...</span>
          <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-bg-base border border-border rounded">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <button
          className="btn-icon relative"
          id="notifications-btn"
          title="Notifications"
        >
          <Bell size={16} />
          {/* Unread dot */}
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full" />
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-200 border',
              showUserMenu
                ? 'bg-bg-elevated border-border-strong'
                : 'border-transparent hover:bg-bg-elevated hover:border-border'
            )}
            id="user-menu-btn"
          >
            <Image
              src={avatarUrl}
              alt={user?.name || 'User'}
              width={24}
              height={24}
              className="avatar w-6 h-6 text-[10px]"
            />
            <span className="text-sm font-medium text-text-primary hidden md:block max-w-[120px] truncate">
              {user?.name}
            </span>
            {user?.plan === 'PRO' && (
              <span className="badge badge-violet text-[10px] hidden md:inline-flex">Pro</span>
            )}
            <ChevronDown
              size={12}
              className={cn(
                'text-text-muted transition-transform duration-200',
                showUserMenu && 'rotate-180'
              )}
            />
          </button>

          {/* Dropdown */}
          {showUserMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-52 card-elevated z-50 animate-scale-in p-1">
              {/* User info */}
              <div className="px-3 py-2.5 border-b border-border mb-1">
                <p className="text-sm font-medium text-text-primary truncate">{user?.name}</p>
                <p className="text-xs text-text-muted truncate">{user?.email}</p>
              </div>

              <button
                onClick={() => { router.push('/dashboard/profile'); setShowUserMenu(false); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors"
              >
                <User size={14} />
                <span>My Profile</span>
              </button>

              <button
                onClick={() => { router.push('/dashboard/settings'); setShowUserMenu(false); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors"
              >
                <Settings size={14} />
                <span>Settings</span>
              </button>

              <div className="my-1 border-t border-border" />

              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm text-danger hover:bg-danger/10 transition-colors"
                id="logout-btn"
              >
                <LogOut size={14} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
