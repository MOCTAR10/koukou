import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from './app.module.js';
import { uploadsRoot } from './modules/farms/farms.service.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Logos de ferme : fichiers écrits par POST /farms/:farmId/logo, servis
  // publiquement sous /uploads (aucun secret : ce sont des logos).
  const uploads = uploadsRoot();
  await mkdir(join(uploads, 'logos'), { recursive: true });
  app.useStaticAssets(uploads, { prefix: '/uploads/' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('KouKou Ferme API')
    .setDescription(
      'API de gestion avicole offline-first pour le Gabon — Module 1 : Gestion des Lots',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const configService = app.get(ConfigService);
  SwaggerModule.setup(
    configService.get('SWAGGER_PATH', 'api-docs'),
    app,
    document,
  );

  const port = configService.get('PORT', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`KouKou Ferme API démarré sur http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(
    `Swagger disponible sur http://localhost:${port}/${configService.get(
      'SWAGGER_PATH',
      'api-docs',
    )}`,
  );
}
await bootstrap();
