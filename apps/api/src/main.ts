import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import type { AppConfiguration } from "./config/environment";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService<AppConfiguration, true>);
  const { port, origins } = config.get("http", { infer: true });
  app.setGlobalPrefix("api");
  app.enableCors({ origin: origins, methods: ["GET", "HEAD", "OPTIONS"] });
  app.enableShutdownHooks();
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : "API startup failed", "Bootstrap");
  process.exitCode = 1;
});
