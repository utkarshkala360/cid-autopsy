import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for secrets at rest (Salesforce refresh tokens). The key is a separate env var,
// not derived from DATABASE_URL: a leaked DB dump alone must not expose credentials, and
// rotating the DB password must not make stored credentials unreadable.
const VERSION = "v1";

let cachedKey: Buffer | undefined;

function key() {
  if (!cachedKey) {
    const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
    if (!raw) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32");
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
    cachedKey = decoded;
  }
  return cachedKey;
}

// `context` is bound as associated data, so a ciphertext only decrypts for the purpose it was made for.
export function encrypt(plaintext: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decrypt(sealed: string, context: string) {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unrecognised ciphertext.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
