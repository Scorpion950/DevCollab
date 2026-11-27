import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { getDatabase, type PrismaClient } from "@devcollab/database";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private client?: PrismaClient;

  get prisma(): PrismaClient {
    this.client ??= getDatabase();
    return this.client;
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.$disconnect().catch(() => {});
    }
  }
}
