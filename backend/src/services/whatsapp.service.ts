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

  async sendProperties(to: string, properties: Property[], searchSummary: string, instance: string = config.whatsapp.instanceName): Promise<void> {
    const textMessage = formatPropertiesResponse(properties, searchSummary);
    await this.sendText(to, textMessage, instance);

    // Send main image for each property (max 3)
    for (const prop of properties.slice(0, 3)) {
      if (prop.main_image_url) {
        const caption = `🏠 ${prop.title_ar ?? prop.title}\n📍 ${prop.district_name ?? ''} - ${prop.city_name ?? ''}\n💰 ${prop.price?.toLocaleString('ar-SA') ?? ''} ريال\n🔗 ${prop.code}`;
        await this.sendImage(to, prop.main_image_url, caption, instance);
        await this.delay(500);
      }

      // Send location if available
      if (prop.latitude && prop.longitude) {
        await this.sendLocation(
          to,
          prop.latitude,
          prop.longitude,
          prop.title_ar ?? prop.title,
          prop.address,
          instance
        );
        await this.delay(500);
      }
    }
  }

  async downloadMedia(messageId: string): Promise<Buffer> {
    try {
      const response = await this.client.get(
        `chat/getBase64FromMediaMessage/${config.whatsapp.instanceName}`,
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
          footer: 'مكتب النقيدان العقاري',
          buttons: buttons.map(b => ({
            buttonId: b.id,
            buttonText: { displayText: b.text },
            type: 1,
          })),
        }
      );
    } catch {
      // Fallback to text if buttons not supported
      const text = `${title}\n${body}\n\n${buttons.map((b, i) => `${['1️⃣','2️⃣','3️⃣','4️⃣'][i] ?? `${i+1}.`} ${b.text}`).join('\n')}`;
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
        footerText: 'مكتب النقيدان العقاري',
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
    if (riyadhHour >= 5 && riyadhHour < 12) return 'صباح الخير ☀️';
    if (riyadhHour >= 12 && riyadhHour < 17) return 'مساء الخير 🌤️';
    if (riyadhHour >= 17 && riyadhHour < 22) return 'مساء النور 🌙';
    return 'أهلاً بك 👋';
  }
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const whatsappService = new WhatsAppService();
