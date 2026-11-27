import { Module } from "@nestjs/common";
import { WriteRateLimitGuard } from "../common/write-rate-limit.guard";
import { MyTasksController, ProjectTasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

@Module({
  controllers: [ProjectTasksController, MyTasksController],
  providers: [TasksService, WriteRateLimitGuard],
  exports: [TasksService],
})
export class TasksModule {}
