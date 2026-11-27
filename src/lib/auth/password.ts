// scrypt password hashing (ADR-003 D-2). Format: scrypt$<log2N>$<r>$<p>$<salt b64url>$<hash b64url>.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export interface ScryptParams { log2N: number; r: number; p: number }
export const SCRYPT_PARAMS: ScryptParams = { log2N: 17, r: 8, p: 1 };
const KEYLEN = 64;
const MAXMEM = 256 * 1024 * 1024;

function derive(plain: string, salt: Buffer, prm: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plain.normalize('NFKC'), salt, KEYLEN, { N: 2 ** prm.log2N, r: prm.r, p: prm.p, maxmem: MAXMEM }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(plain: string, prm: ScryptParams = SCRYPT_PARAMS): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(plain, salt, prm);
  return `scrypt$${prm.log2N}$${prm.r}$${prm.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

function parse(stored: string): { prm: ScryptParams; salt: Buffer; key: Buffer } | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [log2N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (![log2N, r, p].every(Number.isInteger) || log2N < 4 || log2N > 20 || r < 1 || r > 16 || p < 1 || p > 16) return null;
  return { prm: { log2N, r, p }, salt: Buffer.from(parts[4], 'base64url'), key: Buffer.from(parts[5], 'base64url') };
}

// Scrypt hash of a random string that was thrown away (not a secret). Uses exactly SCRYPT_PARAMS (Sasha C-2).
export const DUMMY_HASH =
  'scrypt$17$8$1$6sq83iot3vkeKDBsq41BaA$WhvcpmU53vlI4LNy7tblr1WnxhofqHwopl9ujfZ06UHtvV46VtaW8msGmvXOgdwiLlTwqsV6f3d1UbDah-bTXg';

/** Verifies against the stored hash, or against DUMMY_HASH when stored is null/unparseable (equal work). */
export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  const real = stored ? parse(stored) : null;
  const p = real ?? parse(DUMMY_HASH)!;
  const key = await derive(plain, p.salt, p.prm);
  const ok = key.length === p.key.length && timingSafeEqual(key, p.key);
  return real !== null && ok;
}

export function needsRehash(stored: string): boolean {
  const p = parse(stored);
  return !p || p.prm.log2N !== SCRYPT_PARAMS.log2N || p.prm.r !== SCRYPT_PARAMS.r || p.prm.p !== SCRYPT_PARAMS.p;
}
