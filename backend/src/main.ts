import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { EtagInterceptor } from './common/etag.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });
  // Disable Express's automatic weak ETag (body-hash based). Our EtagInterceptor
  // generates strong ETags from updatedAt for optimistic concurrency — Express's
  // default would clobber that with `setHeader` losing the race on send().
  app.set('etag', false);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.useGlobalInterceptors(new EtagInterceptor());
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`[backend] listening on :${port}`);
}
bootstrap();
