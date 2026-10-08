import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './app.js';
import { InMemoryProvider } from './in-memory-provider.js';

const TOKEN = 'token-de-teste-com-pelo-menos-32-caracteres';

describe('API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(new InMemoryProvider(), { API_TOKEN: TOKEN });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('health é público e verifica o banco', async () => {
    await http().get('/health').expect(200, { status: 'ok', database: 'up' });
  });

  it('exige o token nas demais rotas', async () => {
    await http().get('/accounts').expect(401);
    await http().get('/accounts').set('Authorization', 'Bearer token-errado').expect(401);
    await http().get('/accounts').set('Authorization', TOKEN).expect(401);
    await http().get('/accounts').set('Authorization', `Bearer ${TOKEN}`).expect(200);
  });

  it.each([
    ['limit acima do máximo', { limit: '1000' }],
    ['data em formato inválido', { from: '07/10/2026' }],
    ['data inexistente', { from: '2026-02-30' }],
    ['intervalo invertido', { from: '2026-10-07', to: '2026-10-01' }],
    ['status desconhecido', { status: 'CANCELLED' }],
    ['parâmetro desconhecido', { foo: 'bar' }],
  ])('rejeita filtros inválidos: %s', async (_case, query) => {
    await http()
      .get('/transactions')
      .query(query)
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(400);
  });
});
