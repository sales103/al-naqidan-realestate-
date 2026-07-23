import axios, { AxiosInstance } from 'axios';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import type { SendMessagePayload, Property } from '../types/index.js';
import { formatPropertiesResponse } from '../ai/agent.js';

export class WhatsAppService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${config.whatsapp.evolutionUrl}/`,
      headers: {
        apikey: config.whatsapp.evolutionApiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /** Names of every instance Evolution reports as connected. */
  private async openInstances(): Promise<string[]> {
    try {
      const r = await this.client.get('instance/fetchInstances');
      const list: any[] = r.data ?? [];
      return list
        .filter((i) => (i.connectionStatus ?? i.instance?.state) === 'open')
        .map((i) => i.name ?? i.instanceName ?? i.instance?.instanceName)
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  // Evolution v2 signs each webhook with the *instance* token (its hash),
  // not the global API key, so the webhook handler needs the full set of
  // valid instance tokens to authenticate an incoming call. Cached for a
  // few minutes so we don't hit Evolution on every single webhook.
  private instanceTokens: { at: number; tokens: Set<string> } = { at: 0, tokens: new Set() };

  /** Every per-instance token Evolution knows about (cached ~5 min). */
  async validInstanceTokens(): Promise<Set<string>> {
    const FRESH_MS = 5 * 60 * 1000;
    if (Date.now() - this.instanceTokens.at < FRESH_MS && this.instanceTokens.tokens.size > 0) {
      return this.instanceTokens.tokens;
    }
    try {
      const r = await this.client.get('instance/fetchInstances');
      const list: any[] = r.data ?? [];
      const tokens = new Set<string>();
      for (const i of list) {
        const tok = i.token ?? i.hash ?? i.instance?.token ?? i.instance?.hash ?? i.Auth?.token;
        if (typeof tok === 'string' && tok) tokens.add(tok);
      }
      if (tokens.size > 0) this.instanceTokens = { at: Date.now(), tokens };
      return this.instanceTokens.tokens;
    } catch (e: any) {
      logger.warn('validInstanceTokens fetch failed', { error: e?.message });
      return this.instanceTokens.tokens; // fall back to whatever we last cached
    }
  }

  /**
   * Send text, falling back to a connected instance.
   * The same WhatsApp account can be attached to several instances and they
   * flip between open/close, so the instance that received a message is not
   * always the one that can still send.
   */
  async sendText(to: string, text: string, instance: string = config.whatsapp.instanceName): Promise<string> {
    try {
      const response = await this.client.post(`message/sendText/${instance}`, { number: to, text });
      logger.info('WhatsApp text sent', { to, instance, length: text.length });
      return response.data.key?.id ?? '';
    } catch (error: any) {
      logger.warn('WhatsApp send failed, trying a connected instance', {
        to, instance, error: error?.message, status: error?.response?.status,
      });

      const open = (await this.openInstances()).filter((i) => i !== instance);
      for (const alt of open) {
        try {
          const response = await this.client.post(`message/sendText/${alt}`, { number: to, text });
          logger.info('WhatsApp text sent via fallback instance', { to, instance: alt });
          return response.data.key?.id ?? '';
        } catch { /* try the next one */ }
      }

      logger.error('WhatsApp send text failed on every instance', {
        to, instance, tried: open, error: error?.message,
      });
      throw error;
    }
  }

  async sendImage(to: string, imageUrl: string, caption?: string, instance: string = config.whatsapp.instanceName): Promise<string> {
    try {
      const response = await this.client.post(
        `message/sendMedia/${instance}`,
        {
          number: to,
          mediatype: 'image',
          media: imageUrl,
          caption: caption ?? '',
        }
      );
      return response.data.key?.id ?? '';
    } catch (error: any) {
      logger.error('WhatsApp send image failed', { to, instance, error: error.message });
      throw error;
    }
  }

  async sendDocument(to: string, url: string, fileName: string, caption?: string, instance: string = config.whatsapp.instanceName): Promise<string> {
    try {
      const response = await this.client.post(
        `message/sendMedia/${instance}`,
        {
          number: to,
          mediatype: 'document',
          media: url,
          fileName,
          caption: caption ?? '',
        }
      );
      return response.data.key?.id ?? '';
    } catch (error: any) {
      logger.error('WhatsApp send document failed', { to, instance, error: error.message });
      throw error;
    }
  }

  async sendLocation(to: string, lat: number, lng: number, name?: string, address?: string, instance: string = config.whatsapp.instanceName): Promise<string> {
    try {
      const response = await this.client.post(
        `message/sendLocation/${instance}`,
        { number: to, latitude: lat, longitude: lng, name, address }
      );
      return response.data.key?.id ?? '';
    } catch (error: any) {
      logger.error('WhatsApp send location failed', { to, instance, error: error.message });
      throw error;
    }
  }

  /**
   * WhatsApp rejects a text body over 4096 characters. The listing text is
   * built from every match, so a large result set produced one oversized
   * message that failed outright and left the customer with nothing.
   */
  private splitForWhatsapp(text: string, limit = 3500): string[] {
    if (text.length <= limit) return [text];
    const chunks: string[] = [];
    let current = '';
    // Split on the separator between listings so a property is never cut in half.
    for (const block of text.split('\n\n───────────\n\n')) {
      const candidate = current ? `${current}\n\n───────────\n\n${block}` : block;
      if (candidate.length > limit && current) {
        chunks.push(current);
        current = block;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  /**
   * How many photos to attach, regardless of how many listings matched.
   * The full list still goes out as text — this caps only the media, because
   * a couple of hundred images back to back floods the customer's chat and is
   * the pattern that gets a business number flagged for spam.
   */
  private static readonly MAX_PROPERTY_IMAGES = 10;

  async sendProperties(to: string, properties: Property[], searchSummary: string, instance: string = config.whatsapp.instanceName): Promise<void> {
    const textMessage = formatPropertiesResponse(properties, searchSummary);
    for (const chunk of this.splitForWhatsapp(textMessage)) {
      await this.sendText(to, chunk, instance);
      await this.delay(400);
    }

    const withMedia = properties.slice(0, WhatsAppService.MAX_PROPERTY_IMAGES);
    if (properties.length > withMedia.length) {
      logger.info('Property photos capped', {
        matched: properties.length, sent: withMedia.length,
      });
    }

    // The client wants a photo with every matching listing, not just the top
    // few — send one per property regardless of how many matched. A single
    // broken image URL used to throw and abort the whole loop, which the
    // caller's try/catch then treated as a full pipeline failure — the
    // customer got the text list but every remaining photo silently vanished.
    for (const prop of withMedia) {
      if (prop.main_image_url) {
        try {
          // Include the Maps link in the caption only when there are no
          // coordinates to send as a real pin below (avoids duplicating it).
          const mapsLine = prop.google_maps_url && !(prop.latitude && prop.longitude)
            ? `\nالموقع: ${prop.google_maps_url}` : '';
          const caption = `${prop.title_ar ?? prop.title}\n${prop.district_name ?? ''} - ${prop.city_name ?? ''}\n${prop.price?.toLocaleString('ar-SA') ?? ''} ريال\n${prop.code}${mapsLine}`;
          await this.sendImage(to, prop.main_image_url, caption, instance);
          await this.delay(500);
        } catch (error: any) {
          logger.warn('Property image skipped after send failure', {
            propertyId: prop.id, code: prop.code, url: prop.main_image_url, error: error?.message,
          });
        }
      }

      // Send location if available
      if (prop.latitude && prop.longitude) {
        try {
          await this.sendLocation(
            to,
            prop.latitude,
            prop.longitude,
            prop.title_ar ?? prop.title,
            prop.address,
            instance
          );
          await this.delay(500);
        } catch (error: any) {
          logger.warn('Property location skipped after send failure', {
            propertyId: prop.id, code: prop.code, error: error?.message,
          });
        }
      }
    }
  }

  async downloadMedia(messageId: string, instance: string = config.whatsapp.instanceName): Promise<Buffer> {
    try {
      const response = await this.client.get(
        `chat/getBase64FromMediaMessage/${instance}`,
        { params: { message: messageId } }
      );
      const base64 = response.data.base64 as string;
      return Buffer.from(base64.split(',').pop() ?? base64, 'base64');
    } catch (error: any) {
      logger.error('Media download failed', { messageId, error: error.message });
      throw error;
    }
  }

  async markAsRead(messageId: string, chatId: string, instance: string = config.whatsapp.instanceName): Promise<void> {
    try {
      await this.client.post(`chat/readMessages/${instance}`, {
        readMessages: [{ id: messageId, fromMe: false, remoteJid: chatId }],
      });
    } catch {
      // Non-critical, don't throw
    }
  }

  /** Shows "typing…" while the bot is thinking — a small professionalism
   * touch so the reply doesn't just appear with no acknowledgement at all. */
  async sendTyping(to: string, instance: string = config.whatsapp.instanceName): Promise<void> {
    try {
      await this.client.post(`chat/sendPresence/${instance}`, {
        number: to, presence: 'composing', delay: 3000,
      });
    } catch {
      // Cosmetic only — never let this block or fail the reply pipeline.
    }
  }

  async getInstanceStatus(): Promise<{ state: string; connected: boolean }> {
    try {
      const response = await this.client.get(
        `instance/connectionState/${config.whatsapp.instanceName}`
      );
      return {
        state: response.data.instance?.state ?? 'unknown',
        connected: response.data.instance?.state === 'open',
      };
    } catch {
      return { state: 'error', connected: false };
    }
  }


  async sendButtons(to: string, title: string, body: string, buttons: { id: string; text: string }[], instance: string = config.whatsapp.instanceName): Promise<void> {
    try {
      await this.client.post(
        `message/sendButtons/${instance}`,
        {
          number: to,
          title,
          description: body,
          footer: 'مكتب عبدالحكيم النقيدان العقاري',
          buttons: buttons.map(b => ({
            buttonId: b.id,
            buttonText: { displayText: b.text },
            type: 1,
          })),
        }
      );
    } catch {
      // Fallback to text if buttons not supported
      const text = `${title}\n${body}\n\n${buttons.map((b, i) => `${i + 1}. ${b.text}`).join('\n')}`;
      await this.sendText(to, text, instance);
    }
  }

  /**
   * Interactive list message — real tappable options in WhatsApp.
   * Falls back to a numbered text menu when the account/API can't render lists;
   * the flow accepts the numbers too, so either way the customer can reply.
   */
  async sendList(
    to: string,
    title: string,
    body: string,
    buttonText: string,
    rows: { id: string; title: string; description?: string }[],
    instance: string = config.whatsapp.instanceName,
  ): Promise<'list' | 'text'> {
    try {
      await this.client.post(`message/sendList/${instance}`, {
        number: to,
        title,
        description: body,
        buttonText,
        footerText: 'مكتب عبدالحكيم النقيدان العقاري',
        sections: [{
          title: 'الخيارات',
          rows: rows.map(r => ({
            title: r.title,
            description: r.description ?? '',
            rowId: r.id,
          })),
        }],
      });
      return 'list';
    } catch {
      const menu = rows.map((r, i) => `${i + 1}. ${r.title}`).join('\n');
      await this.sendText(to, `*${title}*\n${body}\n\n${menu}\n\n_اكتب الرقم أو اسم الخيار_`, instance);
      return 'text';
    }
  }

  getRiyadhGreeting(): string {
    const utc = Date.now() + new Date().getTimezoneOffset() * 60000;
    const riyadhHour = new Date(utc + 3 * 3600000).getHours();
    if (riyadhHour >= 5 && riyadhHour < 12) return 'صباح الخير';
    if (riyadhHour >= 12 && riyadhHour < 17) return 'مساء الخير';
    if (riyadhHour >= 17 && riyadhHour < 22) return 'مساء النور';
    return 'أهلاً بك';
  }
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const whatsappService = new WhatsAppService();
