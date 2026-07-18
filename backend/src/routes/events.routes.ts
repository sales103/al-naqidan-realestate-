import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { sseService } from '../services/sse.service.js';
import { randomUUID } from 'crypto';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  // Accept token from query param (EventSource can't set headers)
  const token = (req.query['token'] as string) ?? req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    jwt.verify(token, config.auth.jwtSecret);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  const clientId = randomUUID();
  sseService.addClient(clientId, res);

  const hb = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(hb); }
  }, 25000);

  req.on('close', () => {
    clearInterval(hb);
    sseService.removeClient(clientId);
  });
});

export default router;