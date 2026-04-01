import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export const encrypt = (plaintext: string, hexKey: string, version: number): string => {
	if (!Number.isInteger(version) || version < 1 || version > 255) {
		throw new Error("Version must be an integer between 1 and 255");
	}
	if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
		throw new Error("Key must be 64 hex characters (32 bytes)");
	}

	const key = Buffer.from(hexKey, "hex");
	if (key.length !== 32) {
		throw new Error("Key must be 64 hex characters (32 bytes)");
	}
	const nonce = randomBytes(NONCE_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: AUTH_TAG_LENGTH });

	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const authTag = cipher.getAuthTag();

	const envelope = Buffer.concat([Buffer.from([version]), nonce, encrypted, authTag]);
	return envelope.toString("base64");
};

export const decrypt = (encoded: string, keyMap: Record<number, string>): string => {
	const envelope = Buffer.from(encoded, "base64");

	const MIN_ENVELOPE_LENGTH = 1 + NONCE_LENGTH + AUTH_TAG_LENGTH; // 29 bytes
	if (envelope.length < MIN_ENVELOPE_LENGTH) {
		throw new Error(
			`Invalid encrypted data: envelope too short (${envelope.length} bytes, minimum ${MIN_ENVELOPE_LENGTH})`,
		);
	}

	const version = envelope[0] as number;

	const hexKey = keyMap[version];
	if (!hexKey) {
		throw new Error(`Unknown encryption key version: ${version}`);
	}

	if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
		throw new Error("Key must be 64 hex characters (32 bytes)");
	}

	const key = Buffer.from(hexKey, "hex");
	if (key.length !== 32) {
		throw new Error("Key must be 64 hex characters (32 bytes)");
	}
	const nonce = envelope.subarray(1, 1 + NONCE_LENGTH);
	const authTag = envelope.subarray(envelope.length - AUTH_TAG_LENGTH);
	const ciphertext = envelope.subarray(1 + NONCE_LENGTH, envelope.length - AUTH_TAG_LENGTH);

	const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: AUTH_TAG_LENGTH });
	decipher.setAuthTag(authTag);

	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return decrypted.toString("utf8");
};
