import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { config } from '../config/index.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();
router.use(authenticate);

const evoHeaders = () => ({ apikey: config.whatsapp.evolutionApiKey, 'Content-Type': 'application/json' });
const evoUrl = (path: string) => `${config.whatsapp.evolutionUrl}${path}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Check if instance exists
async function instanceExists(name: string): Promise<boolean> {
  try {
    const r = await axios.get(evoUrl('/instance/fetchInstances'), { headers: evoHeaders() });
    const list: any[] = r.data ?? [];
    return list.some((i: any) => i.instance?.instanceName === name || i.instanceName === name);
  } catch {
    return false;
  }
}

// POST /api/whatsapp/connect/:instance
router.post('/connect/:instance', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { instance } = req.params;

    const exists = await instanceExists(instance);

    if (!exists) {
      // Create instance
      const createRes = await axios.post(evoUrl('/instance/create'), {
        instanceName: instance,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }, { headers: evoHeaders() });

      // If QR came directly in create response
      const directBase64 = createRes.data?.qrcode?.base64;
      if (directBase64) {
        // Configure webhook in background
        const backendUrl = process.env['BACKEND_URL'] ?? process.env['RAILWAY_STATIC_URL'];
        if (backendUrl) {
          axios.put(evoUrl(`/webhook/set/${instance}`), {
            url: `${backendUrl}/api/webhooks/whatsapp`,
            webhook_by_events: false,
            webhook_base64: false,
            events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
          }, { headers: evoHeaders() }).catch(() => {});
        }
        res.json({ success: true, data: { base64: directBase64 } });
        return;
      }

      // Wait for instance to initialize
      await sleep(2000);
    }

    // Configure webhook
    const backendUrl = process.env['BACKEND_URL'] ?? process.env['RAILWAY_STATIC_URL'];
    if (backendUrl) {
      axios.put(evoUrl(`/webhook/set/${instance}`), {
        url: `${backendUrl}/api/webhooks/whatsapp`,
        webhook_by_events: false,
        webhook_base64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      }, { headers: evoHeaders() }).catch(() => {});
    }

    // Get QR code
    const qrRes = await axios.get(evoUrl(`/instance/connect/${instance}`), { headers: evoHeaders() });
    const base64 = qrRes.data?.base64 ?? qrRes.data?.qrcode?.base64;

    if (!base64) {
      res.status(400).json({ success: false, error: 'لم يُولَّد الباركود، حاول مرة أخرى بعد ثوانٍ' });
      return;
    }

    res.json({ success: true, data: { base64 } });
  } catch (error: any) {
    const msg = error?.response?.data?.message ?? error?.response?.data?.error ?? error?.message ?? 'خطأ في الاتصال';
    console.error('[WA connect error]', error?.response?.status, msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/whatsapp/status/:instance
router.get('/status/:instance', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { instance } = req.params;
    const r = await axios.get(evoUrl(`/instance/connectionState/${instance}`), { headers: evoHeaders() });
    res.json({ success: true, data: r.data });
  } catch {
    res.json({ success: true, data: { state: 'close' } });
  }
});

// GET /api/whatsapp/qr/:instance
router.get('/qr/:instance', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { instance } = req.params;
    const r = await axios.get(evoUrl(`/instance/connect/${instance}`), { headers: evoHeaders() });
    const base64 = r.data?.base64 ?? r.data?.qrcode?.base64;
    if (!base64) {
      res.status(400).json({ success: false, error: 'الباركود غير متاح' });
      return;
    }
    res.json({ success: true, data: { base64 } });
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
