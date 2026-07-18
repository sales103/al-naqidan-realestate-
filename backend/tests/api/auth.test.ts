import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import app from '../../src/index.js';
import { initDatabase, closeDatabase } from '../../src/database/connection.js';
import { initRedis, closeRedis } from '../../src/database/redis.js';

describe('Auth API', () => {
  beforeAll(async () => {
    await initDatabase();
    await initRedis();
  });

  afterAll(async () => {
    await closeDatabase();
    await closeRedis();
  });

  it('POST /api/auth/login - valid credentials returns token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@naqidan.com', password: 'Admin@123456' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe('admin@naqidan.com');
  });

  it('POST /api/auth/login - invalid credentials returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@naqidan.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/auth/me - requires auth', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me - returns user with valid token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@naqidan.com', password: 'Admin@123456' });

    const token = loginRes.body.data.token;
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe('admin@naqidan.com');
  });
});

describe('Properties API', () => {
  let token: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@naqidan.com', password: 'Admin@123456' });
    token = res.body.data.token;
  });

  it('GET /api/properties - returns property list', async () => {
    const res = await request(app).get('/api/properties');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/properties?property_type=apartment - filters by type', async () => {
    const res = await request(app).get('/api/properties?property_type=apartment');
    expect(res.status).toBe(200);
    res.body.data.forEach((p: any) => {
      expect(p.property_type).toBe('apartment');
    });
  });

  it('GET /api/properties/stats - requires auth', async () => {
    const res = await request(app)
      .get('/api/properties/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeDefined();
  });
});

describe('Health Check', () => {
  it('GET /health - returns healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });
});
