import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
function key(path: string, create: boolean) {
  const configured = process.env.PEEK_ENCRYPTION_KEY;
  if (configured) {
    const value = Buffer.from(configured, "base64");
    if (value.length !== 32) throw new Error("encryption-key");
    return value;
  }
  const file = join(dirname(path), "secret.key");
  try {
    const value = readFileSync(file);
    if (value.length !== 32) throw new Error("encryption-key");
    return value;
  } catch (error) {
    if (!create || (error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error("encryption-key");
    mkdirSync(dirname(file), { recursive: true });
    const value = randomBytes(32);
    try {
      writeFileSync(file, value, { mode: 0o600, flag: "wx" });
      return value;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST")
        return readFileSync(file);
      throw e;
    }
  }
}
export function encryptSecret(text: string, path: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(path, true), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
export function decryptSecret(value: string, path: string) {
  try {
    const data = Buffer.from(value, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(path, false),
      data.subarray(0, 12),
    );
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("encryption-key");
  }
}
