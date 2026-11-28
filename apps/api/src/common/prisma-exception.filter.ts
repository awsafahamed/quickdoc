import { ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

const knownErrors: Record<string, { status: number; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'A record with these details already exists' },
  P2003: { status: HttpStatus.CONFLICT, message: 'This record is still referenced by other records' },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'The requested record was not found' },
  P2023: { status: HttpStatus.BAD_REQUEST, message: 'An identifier in the request is malformed' },
  P2000: { status: HttpStatus.BAD_REQUEST, message: 'A value in the request is too long' },
};

/**
 * Converts database errors into safe, meaningful HTTP responses instead of
 * generic 500s, and never leaks query details to clients.
 */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Database');

  catch(exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientValidationError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.warn(`Rejected invalid database input: ${exception.message.split('\n').at(-1) ?? ''}`);
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'The request contains an invalid value',
        error: 'Bad Request',
      });
      return;
    }

    // Postgres "invalid input syntax for type uuid" surfaces as P2010/raw errors on some versions.
    const isMalformedId = /invalid input syntax for type uuid|Error creating UUID/i.test(exception.message);
    const known = isMalformedId ? knownErrors.P2023 : knownErrors[exception.code];
    if (!known) {
      this.logger.error(`Unhandled database error ${exception.code}`, exception.stack);
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
      return;
    }
    response.status(known.status).json({
      statusCode: known.status,
      message: known.message,
      error: HttpStatus[known.status]?.replace(/_/g, ' ') ?? 'Error',
    });
  }
}
