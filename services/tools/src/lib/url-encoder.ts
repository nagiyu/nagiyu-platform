export const ERROR_MESSAGES = {
  ENCODE_FAILED: 'URLエンコードに失敗しました。',
  DECODE_FAILED: 'URLデコードに失敗しました。',
} as const;

export const encodeUrl = (text: string): string => {
  try {
    return encodeURIComponent(text);
  } catch {
    throw new Error(ERROR_MESSAGES.ENCODE_FAILED);
  }
};

export const decodeUrl = (encodedText: string): string => {
  try {
    return decodeURIComponent(encodedText.trim());
  } catch {
    throw new Error(ERROR_MESSAGES.DECODE_FAILED);
  }
};
