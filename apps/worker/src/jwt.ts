import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifiedJwtClaims {
  sub?: string;
  iss?: string;
  aud?: string;
  jti?: string;
  exp?: number;
  [key: string]: unknown;
}

function decodeBase64Url(segment: string): Buffer {
  const pad = segment.length % 4 === 0 ? "" : "=".repeat(4 - (segment.length % 4));
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function encodeBase64Url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function signHs256Jwt(claims: Record<string, unknown>, secret: string): string {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const sig = encodeBase64Url(createHmac("sha256", secret).update(signingInput).digest());
  return `${signingInput}.${sig}`;
}

export function verifyHs256Jwt(
  token: string,
  secret: string,
  expected: { iss: string; aud: string },
): VerifiedJwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error("Malformed assertion token.");
  }

  let headerJson: { alg?: string };
  try {
    headerJson = JSON.parse(decodeBase64Url(parts[0]).toString("utf8")) as { alg?: string };
  } catch {
    throw new Error("Invalid assertion header.");
  }
  if (headerJson.alg !== "HS256") {
    throw new Error("Unsupported assertion algorithm.");
  }

  const signingInput = `${parts[0]}.${parts[1]}`;
  const expectedSig = createHmac("sha256", secret).update(signingInput).digest();
  const providedSig = decodeBase64Url(parts[2]);

  if (expectedSig.length !== providedSig.length || !timingSafeEqual(expectedSig, providedSig)) {
    throw new Error("Invalid assertion signature.");
  }

  let claims: VerifiedJwtClaims;
  try {
    claims = JSON.parse(decodeBase64Url(parts[1]).toString("utf8")) as VerifiedJwtClaims;
  } catch {
    throw new Error("Invalid assertion payload.");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= nowSec - 5) {
    throw new Error("Assertion token has expired.");
  }
  if (claims.iss !== expected.iss || claims.aud !== expected.aud) {
    throw new Error("Assertion issuer or audience mismatch.");
  }

  return claims;
}
