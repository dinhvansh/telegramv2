import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const ENCRYPTED_PREFIX = 'enc:';
const SECRET_PLACEHOLDER = '__configured__';

function getEncryptionKey() {
  const seed =
    process.env.SETTINGS_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    'local-dev-settings-key';

  return createHash('sha256').update(seed).digest();
}

export function encryptSecretValue(value: string) {
  if (!value) {
    return '';
  }

  if (value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecretValue(value: string) {
  if (!value || !value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }

  const payload = value.slice(ENCRYPTED_PREFIX.length).replace(/^:/, '');
  const [ivRaw, tagRaw, payloadRaw] = payload.split(':');
  if (!ivRaw || !tagRaw || !payloadRaw) {
    return '';
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      getEncryptionKey(),
      Buffer.from(ivRaw, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payloadRaw, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

export function maskSecretValue(value: string) {
  return value ? SECRET_PLACEHOLDER : '';
}

export function isMaskedSecretValue(value: string | undefined) {
  return String(value || '') === SECRET_PLACEHOLDER;
}

export function getSecretPlaceholder() {
  return SECRET_PLACEHOLDER;
}
