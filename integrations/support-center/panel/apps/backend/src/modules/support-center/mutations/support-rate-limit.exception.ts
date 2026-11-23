import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

export class SupportRateLimitException extends HttpException {
  constructor(readonly retryAfter: number) {
    super(
      { message: 'SUPPORT_RATE_LIMITED', retryAfter },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Catch(SupportRateLimitException)
export class SupportRateLimitFilter implements ExceptionFilter {
  catch(exception: SupportRateLimitException, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Retry-After', exception.retryAfter);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(429)
      .json(exception.getResponse());
  }
}
