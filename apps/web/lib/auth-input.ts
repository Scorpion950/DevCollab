export function normalizeEmail(input: unknown) {
  if (typeof input !== "string") return "";
  const email = input.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function validPassword(input: unknown): input is string {
  return typeof input === "string" && input.length >= 12 && input.length <= 128;
}
