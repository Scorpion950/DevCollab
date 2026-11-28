import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { getDatabase, type PrismaClient } from "@devcollab/database";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private client?: PrismaClient;

  get prisma(): PrismaClient {
    this.client ??= getDatabase();
    return this.client;
  }

  async onModuleInit() {
    if (!process.env.DATABASE_URL?.trim()) return;
    // Warm pg connection pool / TLS handshake cleanly at startup.
    await this.prisma.$queryRaw`SELECT 1`.catch(() => {});
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.$disconnect().catch(() => {});
    }
  }
}
