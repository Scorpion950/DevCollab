import { getDatabase } from "@devcollab/database";
import { loadWorkerConfig } from "./config.js";
import { AgentWorkerProcessor } from "./job-processor.js";
import { createWorkerHttpServer } from "./worker-server.js";

async function main() {
  const config = loadWorkerConfig(process.env);
  const prisma = getDatabase();
  const processor = new AgentWorkerProcessor({ prisma, config });
  const runtimeServer = createWorkerHttpServer({ prisma, config });

  let shuttingDown = false;
  const shutdown = () => {
    shuttingDown = true;
    void runtimeServer.close().catch(() => {});
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const boundPort = await runtimeServer.listen();

  console.log(
    JSON.stringify({
      event: "worker_started",
      workerId: config.workerId,
      workerHttpPort: boundPort,
      pollIntervalMs: config.pollIntervalMs,
      aiConfigured: Boolean(config.ai),
      githubConfigured: Boolean(config.github),
      sandboxEnabled: config.sandboxEnabled,
      storageMode: config.workspaceStorageMode,
      terminalEnabled: config.terminalEnabled,
    }),
  );

  while (!shuttingDown) {
    try {
      const processed = await processor.processNextOnce();
      if (!processed) {
        await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "worker_loop_error",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
    }
  }

  await runtimeServer.close().catch(() => {});
  await prisma.$disconnect();
}

void main();
