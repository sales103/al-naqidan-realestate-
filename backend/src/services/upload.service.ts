import axios from 'axios';
import sharp from 'sharp';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

/**
 * Uploads a buffer to ImgBB and returns a permanent public URL.
 * Railway's own filesystem is wiped on every redeploy, so property photos
 * cannot live on local disk — they must land in durable storage the first time.
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  _folder: string = 'al-naqidan/properties'
): Promise<{ url: string; publicId: string }> {
  if (!config.imgbb.apiKey) {
    throw new Error('ImgBB غير مُهيّأ — أضف IMGBB_API_KEY في متغيرات البيئة');
  }

  // ImgBB has no transformation pipeline, so resize/compress here —
  // WhatsApp doesn't need original-resolution photos anyway.
  const resized = await sharp(buffer)
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  const form = new URLSearchParams();
  form.append('image', resized.toString('base64'));

  try {
    const { data } = await axios.post('https://api.imgbb.com/1/upload', form, {
      params: { key: config.imgbb.apiKey },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
    });

    if (!data?.success || !data?.data?.url) {
      throw new Error(data?.error?.message ?? 'ImgBB upload returned no URL');
    }

    return { url: data.data.url as string, publicId: String(data.data.id ?? '') };
  } catch (error: any) {
    logger.error('ImgBB upload failed', { error: error?.response?.data ?? error?.message });
    throw error;
  }
}

// ImgBB's free tier has no delete API — images are kept indefinitely (or
// per the account's own retention setting). Nothing to do here.
export async function deleteImage(_publicId: string): Promise<void> {}
