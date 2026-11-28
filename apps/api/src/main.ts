import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { SafeExceptionFilter } from "./common/http-exception.filter";
import type { AppConfiguration } from "./config/environment";

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

interface MiddlewareRequest {
  requestId?: string;
  method?: string;
  path?: string;
  header(name: string): string | undefined;
}

interface MiddlewareResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  on(event: "finish", listener: () => void): void;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService<AppConfiguration, true>);
  const { port, origins } = config.get("http", { infer: true });
  const httpLogger = new Logger("HTTP");

  const expressApp = app.getHttpAdapter().getInstance() as { disable?: (k: string) => void } | undefined;
  expressApp?.disable?.("x-powered-by");

  app.use((req: MiddlewareRequest, res: MiddlewareResponse, next: () => void) => {
    const incomingId = req.header("x-request-id");
    const requestId = incomingId && REQUEST_ID_RE.test(incomingId) ? incomingId : randomUUID();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    const start = performance.now();
    res.on("finish", () => {
      if (req.path === "/api/health") return;
      const durationMs = Math.round(performance.now() - start);
      httpLogger.log(
        `[${requestId}] ${req.method ?? "HTTP"} ${req.path ?? "/"} -> ${res.statusCode} (${durationMs}ms)`,
      );
    });
    next();
  });

  app.useGlobalFilters(new SafeExceptionFilter());
  app.setGlobalPrefix("api");
  app.enableCors({ origin: origins, methods: ["GET", "HEAD", "OPTIONS"] });
  app.enableShutdownHooks();
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : "API startup failed", "Bootstrap");
  process.exitCode = 1;
});
