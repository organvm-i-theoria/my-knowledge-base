/**
 * Symmetric encryption helpers for backups or sensitive payloads.
 */

import crypto from 'crypto';

const HEADER = Buffer.from('ENC1');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export function normalizeKey(rawKey: string): Buffer {
  const trimmed = rawKey.trim();
  let key: Buffer;

  if (trimmed.startsWith('base64:')) {
    key = Buffer.from(trimmed.slice('base64:'.length), 'base64');
  } else if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    key = Buffer.from(trimmed, 'hex');
  } else {
    key = Buffer.from(trimmed, 'base64');
  }

  if (key.length !== KEY_LENGTH) {
    throw new Error('Encryption key must be 32 bytes (hex or base64)');
  }

  return key;
}

export function encryptBuffer(plain: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([HEADER, iv, tag, ciphertext]);
}

export function decryptBuffer(encrypted: Buffer, key: Buffer): Buffer {
  if (encrypted.length < HEADER.length + IV_LENGTH + TAG_LENGTH) {
    throw new Error('Encrypted payload too short');
  }

  const header = encrypted.subarray(0, HEADER.length);
  if (!header.equals(HEADER)) {
    throw new Error('Invalid encryption header');
  }

  const ivStart = HEADER.length;
  const ivEnd = ivStart + IV_LENGTH;
  const tagEnd = ivEnd + TAG_LENGTH;

  const iv = encrypted.subarray(ivStart, ivEnd);
  const tag = encrypted.subarray(ivEnd, tagEnd);
  const ciphertext = encrypted.subarray(tagEnd);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
