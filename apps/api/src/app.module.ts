import { UsersModule } from "./users/users.module";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnvironment } from "./config/environment";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    HealthModule, UsersModule,
  ],
})
export class AppModule {}
