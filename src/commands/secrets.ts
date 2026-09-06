import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const value = process.env.COMMAND_ENCRYPTION_KEY;
  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) throw new Error("COMMAND_ENCRYPTION_KEY is required for PUSH configuration");
  return Buffer.from(value, "hex");
}

export function encryptCommandSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function decryptCommandSecret(row: { commandAuthCiphertext: string | null; commandAuthIv: string | null; commandAuthTag: string | null }) {
  if (!row.commandAuthCiphertext || !row.commandAuthIv || !row.commandAuthTag) return null;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(row.commandAuthIv, "base64"));
  decipher.setAuthTag(Buffer.from(row.commandAuthTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(row.commandAuthCiphertext, "base64")), decipher.final()]).toString("utf8");
}
