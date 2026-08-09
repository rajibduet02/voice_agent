import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

  // Safe behind Caddy / reverse proxies (correct proto and client IP).
  const httpAdapter = app.getHttpAdapter();
  if (httpAdapter.getType() === 'express') {
    httpAdapter.getInstance().set('trust proxy', 1);
  }

  app.use(helmet());

  if (nodeEnv === 'production') {
    app.enableCors({
      origin: frontendUrl,
      credentials: true,
    });
  } else {
    const devOrigins = new Set<string>([
      frontendUrl,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
    app.enableCors({
      origin: [...devOrigins],
      credentials: true,
    });
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

  const port = configService.get<number>('PORT') ?? 4000;
  await app.listen(port, '0.0.0.0');
  // Binding on 0.0.0.0 does not prove a public IP/firewall path is reachable.
  console.log(`API listening. Local: http://localhost:${port}`);
  console.log(`API network binding: http://0.0.0.0:${port}`);
}

void bootstrap();
