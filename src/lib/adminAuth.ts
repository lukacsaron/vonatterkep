import { NextRequest } from 'next/server';

/**
 * Admin endpoints were gated by tokens hardcoded in the source. This repository
 * is public, so those tokens were effectively published - anyone could read the
 * Redis contents or flush the cache.
 *
 * The token now comes from ADMIN_API_TOKEN and the check fails closed: if the
 * variable is unset or blank, no request is authorised.
 */
export function isAuthorizedAdmin(request: NextRequest): boolean {
  const expected = (process.env.ADMIN_API_TOKEN || '').trim();
  if (expected.length === 0) return false;

  const header = request.headers.get('authorization') || '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) return false;

  const provided = header.slice(prefix.length);
  // Length check first: timingSafeEqual throws on length mismatch.
  if (provided.length !== expected.length) return false;

  // Constant-time compare to avoid leaking the token through response timing.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
