import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { config } from '../config/index.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();
router.use(authenticate);

const evoHeaders = () => ({ apikey: config.whatsapp.evolutionApiKey });
const evoUrl = (path: string) => `${config.whatsapp.evolutionUrl}${path}`;

// POST /api/whatsapp/connect/:instance — create or reconnect instance
router.post('/connect/:instance', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { instance } = req.params;

    // Try to create instance
    try {
      await axios.post(evoUrl('/instance/create'), {
        instanceName: instance,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }, { headers: evoHeaders() });
    } catch {
      // Instance may already exist — ignore
    }

    // Get QR code
    const qrRes = await axios.get(evoUrl(`/instance/connect/${instance}`), { headers: evoHeaders() });
    res.json({ success: true, data: qrRes.data });
  } catch (error: any) {
    next(error);
  }
});

// GET /api/whatsapp/status/:instance
router.get('/status/:instance', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { instance } = req.params;
    const r = await axios.get(evoUrl(`/instance/connectionState/${instance}`), { headers: evoHeaders() });
    res.json({ success: true, data: r.data });
  } catch {
    res.json({ success: true, data: { state: 'disconnected' } });
  }
});

// GET /api/whatsapp/qr/:instance
router.get('/qr/:instance', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { instance } = req.params;
    const r = await axios.get(evoUrl(`/instance/connect/${instance}`), { headers: evoHeaders() });
    res.json({ success: true, data: r.data });
  } catch (error: any) {
    next(error);
  }
});

// DELETE /api/whatsapp/disconnect/:instance
router.delete('/disconnect/:instance', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { instance } = req.params;
    await axios.delete(evoUrl(`/instance/logout/${instance}`), { headers: evoHeaders() });
    res.json({ success: true, message: 'Disconnected' });
  } catch (error: any) {
    next(error);
  }
});

export default router;
