import type { HealthResponse } from "@devcollab/shared";
import { Controller, Get } from "@nestjs/common";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  getHealth(): HealthResponse {
    return this.health.getStatus();
  }
}
