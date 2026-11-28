export function scrubSecrets(input: string, extraSecrets: Array<string | undefined | null> = []): string {
  let out = input;

  for (const secret of extraSecrets) {
    if (secret && secret.trim().length >= 4) {
      out = out.split(secret.trim()).join("[REDACTED]");
    }
  }

  // PEM private key blocks
  out = out.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    "[REDACTED_PRIVATE_KEY]",
  );

  // Common bearer / header credentials
  out = out.replace(/(Bearer\s+)[A-Za-z0-9._\-+=]+/gi, "$1[REDACTED]");
  out = out.replace(/(x-api-key\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]");
  out = out.replace(/(authorization\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]");

  // Known provider / GitHub token formats
  out = out.replace(/\bsk-ant-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_ANTHROPIC_KEY]");
  out = out.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_API_KEY]");
  out = out.replace(/\bgh[psou]_[A-Za-z0-9_]{12,}\b/g, "[REDACTED_GITHUB_TOKEN]");
  out = out.replace(/\bgithub_pat_[A-Za-z0-9_]{12,}\b/g, "[REDACTED_GITHUB_TOKEN]");

  // Database/URL basic-auth credentials
  out = out.replace(
    /(postgres(?:ql)?|https?):\/\/([^:/\s@]+):([^@/\s]+)@/gi,
    "$1://[REDACTED]:[REDACTED]@",
  );

  return out;
}
