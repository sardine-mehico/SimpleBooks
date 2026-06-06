import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  // Swagger / OpenAPI catalog. Mounted at `/docs` on the backend, which the
  // production reverse-proxy exposes as `<domain>/api/docs` (the proxy strips
  // the `/api` prefix before forwarding to the backend container).
  //   Local dev: http://localhost:4000/docs
  //   Prod:      https://<domain>/api/docs
  // Schemas are auto-derived from class-validator decorators on DTOs via the
  // @nestjs/swagger CLI plugin configured in nest-cli.json.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SimpleBooks API')
    .setDescription(
      'REST endpoints exposed by the SimpleBooks backend. ' +
        'DTO shapes are introspected from class-validator decorators by the @nestjs/swagger CLI plugin.',
    )
    .setVersion(process.env.npm_package_version ?? '0.6')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`[backend] listening on :${port}`);
  console.log(`[backend] swagger docs at http://localhost:${port}/docs`);
}
bootstrap();
