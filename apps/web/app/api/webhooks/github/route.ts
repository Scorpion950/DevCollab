import { NextResponse } from "next/server";

const MAX_WEBHOOK_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const apiBase = process.env.API_BASE_URL?.replace(/\/$/, "");
  if (!apiBase) {
    return NextResponse.json(
      { message: "Backend API configuration is incomplete." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.byteLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json(
      { message: "Webhook payload exceeds maximum allowed size." },
      { status: 413, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": request.headers.get("content-type") || "application/json",
  };
  const delivery = request.headers.get("x-github-delivery");
  const event = request.headers.get("x-github-event");
  const sig = request.headers.get("x-hub-signature-256");
  if (delivery) headers["x-github-delivery"] = delivery;
  if (event) headers["x-github-event"] = event;
  if (sig) headers["x-hub-signature-256"] = sig;

  try {
    const upstream = await fetch(`${apiBase}/integrations/github/webhooks`, {
      method: "POST",
      headers,
      body: buf,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await upstream.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { message: text || "Webhook relay error" };
    }
    return NextResponse.json(json, {
      status: upstream.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { message: "Could not reach the DevCollab API webhook processor." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
