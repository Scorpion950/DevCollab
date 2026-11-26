import type { HealthResponse } from "@devcollab/shared";
import { Injectable } from "@nestjs/common";

@Injectable()
export class HealthService {
  getStatus(): HealthResponse {
    return { status: "ok", service: "devcollab-api" };
  }
}
