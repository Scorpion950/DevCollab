import "server-only";

export function repositoryUrl(): string | undefined {
  const value = process.env.GITHUB_REPOSITORY_URL;
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.origin === "https://github.com" && !url.username && !url.password &&
        /^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname)) return url.origin + url.pathname;
  } catch {
    return;
  }
}
