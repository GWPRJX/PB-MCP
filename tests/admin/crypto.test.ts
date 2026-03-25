import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test with and without the encryption key, so we import dynamically
// after setting the env var.

const TEST_KEY_HEX = 'a'.repeat(64); // 32-byte key in hex (aes-256)

describe('crypto', () => {
  // ---------------------------------------------------------------------------
  // Helper: fresh import of crypto module (env reads happen at call time via getKey)
  // ---------------------------------------------------------------------------

  async function loadCrypto() {
    // The module reads process.env.ERP_ENCRYPTION_KEY at call time (inside getKey),
    // so we can just set/unset the env var between calls without re-importing.
    const mod = await import('../../src/crypto.js');
    return mod;
  }

  // ---------------------------------------------------------------------------
  // With encryption key set
  // ---------------------------------------------------------------------------

  describe('with ERP_ENCRYPTION_KEY set', () => {
    let originalKey: string | undefined;

    beforeEach(() => {
      originalKey = process.env.ERP_ENCRYPTION_KEY;
      process.env.ERP_ENCRYPTION_KEY = TEST_KEY_HEX;
    });

    afterEach(() => {
      if (originalKey === undefined) {
        delete process.env.ERP_ENCRYPTION_KEY;
      } else {
        process.env.ERP_ENCRYPTION_KEY = originalKey;
      }
    });

    it('encrypt/decrypt roundtrip returns original string', async () => {
      const { encrypt, decrypt } = await loadCrypto();
      const plaintext = 'hello world secret data 123!@#';

      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('encrypt produces colon-separated format (iv:authTag:ciphertext)', async () => {
      const { encrypt } = await loadCrypto();
      const encrypted = encrypt('test');

      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
      // IV is 16 bytes = 32 hex chars
      expect(parts[0]).toMatch(/^[0-9a-f]{32}$/);
      // Auth tag is 16 bytes = 32 hex chars
      expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
      // Ciphertext is non-empty hex
      expect(parts[2]).toMatch(/^[0-9a-f]+$/);
    });

    it('different inputs produce different ciphertexts (non-deterministic IV)', async () => {
      const { encrypt } = await loadCrypto();
      const input = 'same input string';

      const encrypted1 = encrypt(input);
      const encrypted2 = encrypt(input);

      // Same plaintext should produce different ciphertexts due to random IV
      expect(encrypted1).not.toBe(encrypted2);

      // But both should have valid format
      expect(encrypted1.split(':')).toHaveLength(3);
      expect(encrypted2.split(':')).toHaveLength(3);
    });

    it('isEncrypted returns true for encrypted strings', async () => {
      const { encrypt, isEncrypted } = await loadCrypto();
      const encrypted = encrypt('test value');

      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('isEncrypted returns false for plain text', async () => {
      const { isEncrypted } = await loadCrypto();

      expect(isEncrypted('hello world')).toBe(false);
      expect(isEncrypted('')).toBe(false);
      expect(isEncrypted('not:encrypted:data')).toBe(false);
      expect(isEncrypted('abc')).toBe(false);
    });

    it('handles empty string encrypt/decrypt roundtrip', async () => {
      const { encrypt, decrypt } = await loadCrypto();

      const encrypted = encrypt('');
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe('');
    });

    it('handles unicode string encrypt/decrypt roundtrip', async () => {
      const { encrypt, decrypt } = await loadCrypto();
      const plaintext = 'Hello \u{1F600} Unicode \u00E9\u00E8\u00EA';

      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  // ---------------------------------------------------------------------------
  // Without encryption key (passthrough mode)
  // ---------------------------------------------------------------------------

  describe('without ERP_ENCRYPTION_KEY (passthrough)', () => {
    let originalKey: string | undefined;

    beforeEach(() => {
      originalKey = process.env.ERP_ENCRYPTION_KEY;
      delete process.env.ERP_ENCRYPTION_KEY;
    });

    afterEach(() => {
      if (originalKey === undefined) {
        delete process.env.ERP_ENCRYPTION_KEY;
      } else {
        process.env.ERP_ENCRYPTION_KEY = originalKey;
      }
    });

    it('encrypt returns original plaintext when no key set', async () => {
      const { encrypt } = await loadCrypto();

      const plaintext = 'this should pass through unchanged';
      const result = encrypt(plaintext);

      expect(result).toBe(plaintext);
    });

    it('decrypt returns original ciphertext when no key set', async () => {
      const { decrypt } = await loadCrypto();

      const input = 'some:colon:separated:value';
      const result = decrypt(input);

      expect(result).toBe(input);
    });

    it('empty string passes through unchanged', async () => {
      const { encrypt, decrypt } = await loadCrypto();

      expect(encrypt('')).toBe('');
      expect(decrypt('')).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // decrypt edge cases
  // ---------------------------------------------------------------------------

  describe('decrypt edge cases', () => {
    let originalKey: string | undefined;

    beforeEach(() => {
      originalKey = process.env.ERP_ENCRYPTION_KEY;
      process.env.ERP_ENCRYPTION_KEY = TEST_KEY_HEX;
    });

    afterEach(() => {
      if (originalKey === undefined) {
        delete process.env.ERP_ENCRYPTION_KEY;
      } else {
        process.env.ERP_ENCRYPTION_KEY = originalKey;
      }
    });

    it('returns non-encrypted string as-is (not 3 parts)', async () => {
      const { decrypt } = await loadCrypto();

      // String without exactly 3 colon-separated parts is returned as-is
      expect(decrypt('plain text')).toBe('plain text');
      expect(decrypt('one:two')).toBe('one:two');
      expect(decrypt('a:b:c:d')).toBe('a:b:c:d');
    });
  });
});
