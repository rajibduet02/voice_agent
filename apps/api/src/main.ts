import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { buildCorsSettings, normalizeFrontendUrl } from './config/cors.config';
import { readAppEnv } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const env = readAppEnv(configService);

  // Safe behind reverse proxies (correct proto and client IP).
  const httpAdapter = app.getHttpAdapter();
  if (httpAdapter.getType() === 'express') {
    httpAdapter.getInstance().set('trust proxy', 1);
  }

  // Allow cross-origin browser clients to read JSON API responses.
  // Helmet's default CORP "same-origin" is too strict for a public REST API.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const frontendUrl = normalizeFrontendUrl(env.frontendUrl);
  const cors = buildCorsSettings(env.nodeEnv, frontendUrl);
  app.enableCors(cors);

  const frontendConfigured = frontendUrl.length > 0;
  console.log('[CORS] NODE_ENV:', env.nodeEnv);
  console.log('[CORS] FRONTEND_URL configured:', frontendConfigured);
  if (frontendConfigured) {
    console.log('[CORS] Allowed frontend origin:', frontendUrl);
  } else {
    console.error(
      '[CORS] FRONTEND_URL is missing. Browser requests from the Next.js app will fail CORS checks.',
    );
  }

  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Voice Agent Appointment API')
    .setDescription('REST API for appointment booking and Vapi tool integration')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(env.port, '0.0.0.0');
  // Binding on 0.0.0.0 does not prove a public IP/firewall path is reachable.
  console.log(`API listening. Local: http://localhost:${env.port}`);
  console.log(`API network binding: http://0.0.0.0:${env.port}`);
}

void bootstrap();
