import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";

interface HttpRequestLike {
  requestId?: string;
  method?: string;
  path?: string;
}

interface HttpResponseLike {
  status(code: number): { json(body: unknown): void };
}

/**
 * Prevents raw database/driver errors or stack traces from leaking to HTTP callers
 * while preserving explicit NestJS HttpException statuses and messages.
 */
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exception");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<HttpResponseLike>();
    const req = ctx.getRequest<HttpRequestLike>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "object" && body !== null) {
        res.status(status).json(body);
        return;
      }
      res.status(status).json({ statusCode: status, message: String(body) });
      return;
    }

    const reqId = req?.requestId ?? "-";
    const path = req?.path ?? "-";
    const reason = exception instanceof Error ? exception.name : "UnknownError";
    this.logger.error(`[${reqId}] ${req?.method ?? "HTTP"} ${path} failed with ${reason}`);

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: "Internal Server Error",
      message: "An unexpected internal error occurred.",
    });
  }
}
