/**
 * AES-256-GCM encryption/decryption for ERP credentials at rest.
 *
 * When `ERP_ENCRYPTION_KEY` is set (64-char hex), credentials are encrypted
 * before storage and decrypted on read. When unset, all functions pass
 * through without transformation (development mode).
 *
 * Ciphertext format: `<iv_hex>:<authTag_hex>:<encrypted_hex>`
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

/**
 * Load the 256-bit encryption key from the environment.
 * @returns 32-byte Buffer, or empty Buffer if `ERP_ENCRYPTION_KEY` is not set.
 */
function getKey(): Buffer {
  const key = process.env.ERP_ENCRYPTION_KEY;
  if (!key) return Buffer.alloc(0);
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== 32) {
    throw new Error('ERP_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  return buf;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns the original string unchanged if no encryption key is configured.
 * @param plaintext - The string to encrypt.
 * @returns Ciphertext in format `iv:authTag:encrypted` (all hex), or original string.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  if (key.length === 0) return plaintext; // Passthrough if no key configured
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a ciphertext string produced by {@link encrypt}.
 * Returns the original string unchanged if no encryption key is configured
 * or if the input does not match the expected ciphertext format.
 * @param ciphertext - The `iv:authTag:encrypted` hex string to decrypt.
 * @returns The original plaintext string.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  if (key.length === 0) return ciphertext; // Passthrough if no key configured
  const parts = ciphertext.split(':');
  if (parts.length !== 3) return ciphertext; // Not encrypted, return as-is
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/**
 * Check whether a string looks like AES-256-GCM ciphertext.
 * Matches the `iv:authTag:encrypted` hex format produced by {@link encrypt}.
 * @param value - The string to test.
 * @returns `true` if the value matches the encrypted format.
 */
export function isEncrypted(value: string): boolean {
  return /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/.test(value);
}
