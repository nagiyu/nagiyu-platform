export const ERROR_MESSAGES = {
  HASH_FAILED: 'ハッシュ生成に失敗しました。',
} as const;

export const HASH_ALGORITHMS = ['SHA-256', 'SHA-512'] as const;

export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

const convertDigestToHex = (digest: ArrayBuffer): string =>
  Array.from(new Uint8Array(digest), (byte) => {
    return byte.toString(16).padStart(2, '0');
  }).join('');

const convertTextToUtf8Bytes = (text: string): ArrayBuffer => {
  const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
    const arrayBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(arrayBuffer).set(bytes);
    return arrayBuffer;
  };

  if (typeof TextEncoder !== 'undefined') {
    return toArrayBuffer(new TextEncoder().encode(text));
  }
  if (typeof Buffer !== 'undefined') {
    return toArrayBuffer(Uint8Array.from(Buffer.from(text, 'utf-8')));
  }
  throw new Error(ERROR_MESSAGES.HASH_FAILED);
};

export const generateHash = async (text: string, algorithm: HashAlgorithm): Promise<string> => {
  try {
    if (!globalThis.crypto?.subtle) {
      throw new Error(ERROR_MESSAGES.HASH_FAILED);
    }

    const encoded = convertTextToUtf8Bytes(text);
    const digest = await globalThis.crypto.subtle.digest(algorithm, encoded);
    return convertDigestToHex(digest);
  } catch (error) {
    throw new Error(ERROR_MESSAGES.HASH_FAILED, { cause: error });
  }
};
