import * as crypto from 'crypto';

const DEFAULT_KEY = 'd9f8e7d6c5b4a39281706f5e4d3c2b1a0987654321fedcba0987654321abcdef';

function getEncryptionKey(keyString?: string): Buffer {
  const k = keyString || process.env.ENCRYPTION_KEY || DEFAULT_KEY;
  return crypto.createHash('sha256').update(k).digest();
}

/**
 * Encrypts a plain token string using AES-256-GCM.
 */
export function encryptToken(text: string, keyString?: string): string {
  if (!text) return text;
  const encryptionKey = getEncryptionKey(keyString);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Safely decrypts an AES-256-GCM encrypted token string.
 * If the input is not encrypted (e.g., legacy plain token), returns the input as-is.
 */
export function decryptToken(encryptedText: string, keyString?: string): string {
  if (!encryptedText) return encryptedText;
  const parts = String(encryptedText).split(':');
  if (parts.length !== 3) {
    return encryptedText;
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  if (
    !/^[0-9a-fA-F]+$/.test(ivHex) ||
    !/^[0-9a-fA-F]+$/.test(authTagHex) ||
    !/^[0-9a-fA-F]+$/.test(encryptedHex)
  ) {
    return encryptedText;
  }

  try {
    const encryptionKey = getEncryptionKey(keyString);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return encryptedText;
  }
}
