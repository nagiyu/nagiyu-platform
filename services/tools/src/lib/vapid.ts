export const ERROR_MESSAGES = {
  GENERATE_FAILED: 'VAPIDキーの生成に失敗しました。',
  INVALID_RESPONSE: 'VAPIDキー生成APIのレスポンス形式が不正です。',
} as const;

export type VapidKeyPair = {
  publicKey: string;
  privateKey: string;
};

const isVapidKeyPair = (value: unknown): value is VapidKeyPair => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<VapidKeyPair>;
  return typeof candidate.publicKey === 'string' && typeof candidate.privateKey === 'string';
};

export const generateVapidKeys = async (): Promise<VapidKeyPair> => {
  let response: Response;
  try {
    response = await fetch('/api/vapid', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch {
    throw new Error(ERROR_MESSAGES.GENERATE_FAILED);
  }

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES.GENERATE_FAILED);
  }

  const data: unknown = await response.json();
  if (!isVapidKeyPair(data)) {
    throw new Error(ERROR_MESSAGES.INVALID_RESPONSE);
  }

  return data;
};
