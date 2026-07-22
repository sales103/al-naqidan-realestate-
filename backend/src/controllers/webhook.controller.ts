import { Request, Response, NextFunction } from 'express';
import { conversationService } from '../services/conversation.service.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { logger } from '../config/logger.js';
import type { WhatsAppWebhookPayload } from '../types/index.js';

export const handleWhatsAppWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Webhook authentication.
    //
    // Evolution API v2 does NOT send an apikey header on webhooks by default —
    // it authenticates the *caller* (us), not the callee, and relies on the
    // webhook URL itself being secret. So the rule is:
    //   • no apikey header  -> trust it (Evolution's default; URL is the secret)
    //   • apikey present     -> it MUST be the global key or a live instance
    //                           token, otherwise it's a spoof attempt -> reject
    const apikey = req.headers['apikey'] as string | undefined;
    const globalKey = process.env['EVOLUTION_API_KEY'];

    if (apikey && globalKey) {
      let authorized = apikey === globalKey;
      if (!authorized) {
        const tokens = await whatsappService.validInstanceTokens();
        authorized = tokens.has(apikey);
      }
      if (!authorized) {
        logger.warn('Webhook rejected: apikey present but invalid', {
          ip: req.ip,
          received: apikey.slice(0, 8) + '...',
        });
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
    }

    // Respond immediately to prevent timeout
    res.status(200).json({ success: true });

    // Process asynchronously
    const payload = req.body as WhatsAppWebhookPayload;
    conversationService.handleWebhook(payload).catch((err) => {
      logger.error('Async webhook processing failed', { error: err.message });
    });
  } catch (error) {
    next(error);
  }
};

export const getWebhookStatus = async (_req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: { status: 'active', timestamp: new Date() } });
};
