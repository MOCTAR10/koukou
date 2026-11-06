import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from './app.module.js';
import {
  swaggerEnabled,
  trustProxyHops,
} from './common/utils/http-exposure.js';
import { uploadsRoot } from './modules/farms/farms.service.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Farm logos (POST /farms/:farmId/logo) are public under /uploads/logos.
  // Only that folder: the rest of UPLOADS_DIR (sanitary declaration photos)
  // is served by its own routes, to the people allowed to read it.
  const uploads = uploadsRoot();
  await mkdir(join(uploads, 'logos'), { recursive: true });
  app.useStaticAssets(join(uploads, 'logos'), { prefix: '/uploads/logos/' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const configService = app.get(ConfigService);

  app.set(
    'trust proxy',
    trustProxyHops(configService.get<string>('TRUST_PROXY')),
  );

  const corsOrigins = configService.get('CORS_ORIGINS', '*');
  app.enableCors({
    origin: corsOrigins === '*' ? '*' : corsOrigins.split(',').map((o: string) => o.trim()),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    // The audit journal's request id, echoed on every response.
    exposedHeaders: ['X-Request-Id'],
  });

  const swaggerPath = configService.get('SWAGGER_PATH', 'api-docs');
  const swagger = swaggerEnabled(
    configService.get<string>('NODE_ENV'),
    configService.get<string>('SWAGGER_ENABLED'),
  );
  if (swagger) {
    const config = new DocumentBuilder()
      .setTitle('Fermia API')
      .setDescription(
        'API de gestion avicole offline-first pour le Gabon — Module 1 : Gestion des Lots',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(swaggerPath, app, document);
  }

  const port = configService.get('PORT', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Fermia API démarré sur http://localhost:${port}`);
  if (swagger) {
    // eslint-disable-next-line no-console
    console.log(`Swagger disponible sur http://localhost:${port}/${swaggerPath}`);
  }
}
await bootstrap();
