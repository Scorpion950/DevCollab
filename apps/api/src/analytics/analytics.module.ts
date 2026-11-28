import { Global, Module } from "@nestjs/common";
import { AiAnalyticsService } from "./ai-analytics.service";
import { AiPricingService } from "./ai-pricing.service";
import { AnalyticsCacheService } from "./analytics-cache.service";
import { AnalyticsController, ProjectAnalyticsController } from "./analytics.controller";
import { AnalyticsExportService } from "./analytics-export.service";
import { AnalyticsService } from "./analytics.service";
import { GitHubAnalyticsService } from "./github-analytics.service";
import { TaskAnalyticsService } from "./task-analytics.service";

@Global()
@Module({
  controllers: [AnalyticsController, ProjectAnalyticsController],
  providers: [
    AnalyticsCacheService,
    AnalyticsExportService,
    AiPricingService,
    TaskAnalyticsService,
    GitHubAnalyticsService,
    AiAnalyticsService,
    AnalyticsService,
  ],
  exports: [AnalyticsCacheService, AiPricingService],
})
export class AnalyticsModule {}
