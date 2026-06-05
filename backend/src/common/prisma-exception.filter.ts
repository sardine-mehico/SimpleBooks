import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger(PrismaExceptionFilter.name);

  catch(err: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const meta = err.meta ?? {};
    let status = 500;
    let message = 'Database error';

    switch (err.code) {
      case 'P2002':
        status = 409;
        message = `Unique constraint violated on ${JSON.stringify(meta.target ?? 'field')}`;
        break;
      case 'P2003':
        status = 400;
        message = `Referenced record does not exist for ${JSON.stringify(meta.field_name ?? meta.constraint ?? 'foreign key')}`;
        break;
      case 'P2025':
        status = 404;
        message = (meta.cause as string) ?? 'Record not found';
        break;
      default:
        this.log.error(`Unmapped Prisma error ${err.code}: ${err.message}`);
        break;
    }

    res.status(status).json({ statusCode: status, error: err.code, message });
  }
}
