import type { HealthResponse } from "@devcollab/shared";
import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import { InternalServiceGuard } from "../authorization/internal-service.guard";
import {
  HealthService,
  type ReadinessResponse,
  type ServiceDiagnosticsResponse,
} from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  getHealth(): HealthResponse {
    return this.health.getStatus();
  }

  @Get("ready")
  @Header("Cache-Control", "no-store")
  getReadiness(): Promise<ReadinessResponse> {
    return this.health.getReadiness();
  }

  @Get("status")
  @UseGuards(InternalServiceGuard)
  @Header("Cache-Control", "private, no-store")
  getDiagnostics(): Promise<ServiceDiagnosticsResponse> {
    return this.health.getDiagnostics();
  }
}
