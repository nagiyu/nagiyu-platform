export const ERROR_MESSAGES = {
  ENCODE_FAILED: 'Base64エンコードに失敗しました。',
  DECODE_FAILED: 'Base64デコードに失敗しました。',
} as const;

const convertUtf8ToBinary = (text: string): string => {
  if (typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(text);
    return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  }
  return encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_match, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
};

const convertBinaryToUtf8 = (binary: string): string => {
  if (typeof TextDecoder !== 'undefined') {
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  const percentEncoded = Array.from(binary, (char) =>
    `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`
  ).join('');
  return decodeURIComponent(percentEncoded);
};

const encodeBinaryToBase64 = (binary: string): string => {
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(binary, 'binary').toString('base64');
  }
  throw new Error(ERROR_MESSAGES.ENCODE_FAILED);
};

const decodeBase64ToBinary = (encodedText: string): string => {
  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(encodedText);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(encodedText, 'base64').toString('binary');
  }
  throw new Error(ERROR_MESSAGES.DECODE_FAILED);
};

const isValidBase64 = (value: string): boolean => {
  // 空文字列は有効なBase64として扱う
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
    return encodeBinaryToBase64(convertUtf8ToBinary(text));
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
    return convertBinaryToUtf8(decodeBase64ToBinary(normalized));
  } catch {
    throw new Error(ERROR_MESSAGES.DECODE_FAILED);
  }
};
