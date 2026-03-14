export const ERROR_MESSAGES = {
  ENCODE_FAILED: 'Base64エンコードに失敗しました。',
  DECODE_FAILED: 'Base64デコードに失敗しました。',
} as const;

const toBinaryString = (text: string): string => {
  if (typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(text);
    return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  }
  return encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_match, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
};

const fromBinaryString = (binary: string): string => {
  if (typeof TextDecoder !== 'undefined') {
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  const percentEncoded = Array.from(binary, (char) =>
    `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`
  ).join('');
  return decodeURIComponent(percentEncoded);
};

const encodeBinary = (binary: string): string => {
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(binary, 'binary').toString('base64');
  }
  throw new Error(ERROR_MESSAGES.ENCODE_FAILED);
};

const decodeBinary = (encodedText: string): string => {
  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(encodedText);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(encodedText, 'base64').toString('binary');
  }
  throw new Error(ERROR_MESSAGES.DECODE_FAILED);
};

const isValidBase64 = (value: string): boolean => {
  if (!value) {
    return true;
  }
  if (value.length % 4 !== 0) {
    return false;
  }
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
};

export const encodeBase64 = (text: string): string => {
  try {
    return encodeBinary(toBinaryString(text));
  } catch {
    throw new Error(ERROR_MESSAGES.ENCODE_FAILED);
  }
};

export const decodeBase64 = (encodedText: string): string => {
  try {
    const normalized = encodedText.trim();
    if (!isValidBase64(normalized)) {
      throw new Error(ERROR_MESSAGES.DECODE_FAILED);
    }
    return fromBinaryString(decodeBinary(normalized));
  } catch {
    throw new Error(ERROR_MESSAGES.DECODE_FAILED);
  }
};
