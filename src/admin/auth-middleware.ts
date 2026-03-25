import { createHmac, timingSafeEqual } from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

// ---------------------------------------------------------------------------
// JWT utilities — HS256 using Node.js built-in crypto. No external library.
// ---------------------------------------------------------------------------

/**
 * Base64url-encode a string (no padding).
 */
function toBase64Url(data: string): string {
  return Buffer.from(data).toString('base64url');
}

/**
 * Decode a base64url-encoded string.
 */
function fromBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

/**
 * Compute HMAC-SHA256 signature for the given data using JWT_SECRET.
 */
function hmacSign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/**
 * Sign a JWT payload with HS256.
 *
 * Automatically sets `iat` (issued at) and `exp` (expiration) claims.
 * Expiration is configurable via JWT_EXPIRY_HOURS env var (default: 8 hours).
 *
 * @throws if JWT_SECRET env var is not set.
 */
export function signJwt(payload: Record<string, unknown>): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('[auth-middleware] JWT_SECRET environment variable is not set');
  }

  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

  const iat = Math.floor(Date.now() / 1000);
  const expiryHours = parseInt(process.env.JWT_EXPIRY_HOURS ?? '8', 10);
  const exp = iat + expiryHours * 3600;

  const fullPayload = { ...payload, iat, exp };
  const encodedPayload = toBase64Url(JSON.stringify(fullPayload));

  const signature = hmacSign(`${header}.${encodedPayload}`, secret);

  return `${header}.${encodedPayload}.${signature}`;
}

/**
 * Verify a JWT token.
 *
 * - Validates HS256 signature using `crypto.timingSafeEqual` (timing-attack safe)
 * - Checks `exp` claim against current time
 *
 * @returns Decoded payload on success, `null` on any failure.
 */
export function verifyJwt(token: string): Record<string, unknown> | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;

  // Recompute expected signature
  const expectedSignature = hmacSign(`${header}.${payload}`, secret);

  // Timing-safe comparison — both must be the same length for timingSafeEqual
  const sigBuf = Buffer.from(signature, 'base64url');
  const expectedBuf = Buffer.from(expectedSignature, 'base64url');

  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  // Decode and check expiration
  try {
    const decoded = JSON.parse(fromBase64Url(payload)) as Record<string, unknown>;
    const exp = decoded.exp as number | undefined;
    if (exp !== undefined && exp < Math.floor(Date.now() / 1000)) {
      return null; // Token expired
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Fastify onRequest hook for admin route authentication.
 *
 * Accepts EITHER:
 * 1. `Authorization: Bearer <JWT>` header (verified via verifyJwt)
 * 2. `X-Admin-Secret` header (checked against ADMIN_SECRET env var)
 *
 * Returns 401 if neither is valid. This provides backward compatibility
 * while enabling JWT-based auth for the dashboard.
 */
export async function jwtAuthHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Try JWT first (Authorization: Bearer <token>)
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const decoded = verifyJwt(token);
    if (decoded) return; // Valid JWT — allow request
  }

  // Fall back to X-Admin-Secret header (timing-safe comparison)
  const adminSecret = request.headers['x-admin-secret'];
  const expectedSecret = process.env.ADMIN_SECRET;
  if (adminSecret && expectedSecret &&
      typeof adminSecret === 'string' &&
      adminSecret.length === expectedSecret.length &&
      timingSafeEqual(Buffer.from(adminSecret), Buffer.from(expectedSecret))) {
    return; // Valid admin secret — allow request
  }

  // Neither valid — reject
  return reply.status(401).send({
    error: 'Unauthorized',
    message: 'Valid JWT or admin secret required',
  });
}
