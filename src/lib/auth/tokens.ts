import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}
export function sha256(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
export function sha256hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}
