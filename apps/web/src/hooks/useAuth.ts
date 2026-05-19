import { useAuthStore } from '@/store/auth.store';

export function useUser() {
  return useAuthStore((state) => state.user);
}

export function useAuth() {
  return useAuthStore();
}
