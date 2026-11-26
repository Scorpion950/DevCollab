import "server-only";

export function authSettings() {
  const ready = Boolean(process.env.DATABASE_URL && (process.env.AUTH_SECRET?.length ?? 0) >= 32);
  return {
    ready,
    google: ready && Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    github: ready && Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET),
  };
}
