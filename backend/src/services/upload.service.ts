import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  const { accountId, accessKeyId, secretAccessKey, bucket, publicUrl } = config.r2;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new Error(
      'R2 غير مُهيّأ — أضف R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME / R2_PUBLIC_URL في متغيرات البيئة'
    );
  }
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

/**
 * Uploads a buffer to Cloudflare R2 and returns a permanent public URL.
 * Railway's own filesystem is wiped on every redeploy, so property photos
 * cannot live on local disk — they must land in durable storage the first time.
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  folder: string = 'al-naqidan/properties'
): Promise<{ url: string; publicId: string }> {
  const s3 = getClient();

  // R2 has no built-in transformation pipeline like Cloudinary, so resize and
  // compress here — WhatsApp doesn't need original-resolution photos anyway.
  const resized = await sharp(buffer)
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  const key = `${folder}/${randomUUID()}.jpg`;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: config.r2.bucket,
        Key: key,
        Body: resized,
        ContentType: 'image/jpeg',
      })
    );
  } catch (error: any) {
    logger.error('R2 upload failed', { error: error?.message, key });
    throw error;
  }

  const base = config.r2.publicUrl.replace(/\/$/, '');
  return { url: `${base}/${key}`, publicId: key };
}

export async function deleteImage(publicId: string): Promise<void> {
  try {
    const s3 = getClient();
    await s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: publicId }));
  } catch (e: any) {
    logger.warn('R2 delete failed', { publicId, error: e?.message });
  }
}
