import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import helmet from 'helmet';
import request from 'supertest';
import { App } from 'supertest/types';
import { buildCorsSettings } from '../src/config/cors.config';

@Controller('api/v1/public/carepoint-clinic')
class CorsProbeController {
  @Get('services')
  services() {
    return { services: [{ id: 'probe', name: 'Probe Service' }] };
  }
}

describe('CORS browser connectivity (e2e)', () => {
  let app: INestApplication<App>;
  const productionFrontendOrigin = 'https://voice-agent-web-lac.vercel.app';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CorsProbeController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(
      helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
      }),
    );
    app.enableCors(buildCorsSettings('production', productionFrontendOrigin));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows the production frontend origin on public services', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/public/carepoint-clinic/services')
      .set('Origin', productionFrontendOrigin)
      .expect(200);

    expect(response.body.services).toHaveLength(1);
    expect(response.headers['access-control-allow-origin']).toBe(
      productionFrontendOrigin,
    );
  });

  it('does not allow an unrelated origin in production', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/public/carepoint-clinic/services')
      .set('Origin', 'https://malicious-example.com')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers OPTIONS preflight for the production frontend', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/v1/public/carepoint-clinic/services')
      .set('Origin', productionFrontendOrigin)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(
      productionFrontendOrigin,
    );
    expect(String(response.headers['access-control-allow-methods'] ?? '')).toMatch(
      /GET/i,
    );
    expect(String(response.headers['access-control-allow-headers'] ?? '')).toMatch(
      /content-type/i,
    );
  });
});
