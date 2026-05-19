import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Generate with: openssl rand -base64 32`,
    );
  }
  return key;
}

/** Encrypts a string with AES-256-GCM. Returns base64(iv|authTag|ciphertext). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decrypt(ciphertextB64: string): string {
  const buf = Buffer.from(ciphertextB64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** SHA-256 of a bearer token; we store only the hash. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Generates a 32-byte URL-safe bearer token, returned with its hash + display prefix. */
export function generateToken(): { token: string; hash: string; prefix: string } {
  const raw = randomBytes(32).toString("base64url");
  const token = `oc_${raw}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 11) };
}
