import { generateKeyPairSync } from 'crypto';
import { NextResponse } from 'next/server';

const ERROR_MESSAGES = {
  GENERATE_FAILED: 'VAPIDキーの生成に失敗しました。',
  INVALID_KEY_FORMAT: '生成された鍵の形式が不正です。',
} as const;

type JwkKey = {
  x?: string;
  y?: string;
  d?: string;
};

const generateKeyPairData = (): { publicKey: JwkKey; privateKey: JwkKey } => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });

  return {
    publicKey: publicKey.export({ format: 'jwk' }) as JwkKey,
    privateKey: privateKey.export({ format: 'jwk' }) as JwkKey,
  };
};

const isValidPublicJwk = (key: JwkKey): key is Required<Pick<JwkKey, 'x' | 'y'>> => {
  return typeof key.x === 'string' && typeof key.y === 'string';
};

const isValidPrivateJwk = (key: JwkKey): key is Required<Pick<JwkKey, 'd'>> => {
  return typeof key.d === 'string';
};

const convertJwkToVapidKeys = (publicJwk: JwkKey, privateJwk: JwkKey) => {
  if (!isValidPublicJwk(publicJwk) || !isValidPrivateJwk(privateJwk)) {
    throw new Error(ERROR_MESSAGES.INVALID_KEY_FORMAT);
  }

  const publicKey = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(publicJwk.x, 'base64url'),
    Buffer.from(publicJwk.y, 'base64url'),
  ]).toString('base64url');

  const privateKey = Buffer.from(privateJwk.d, 'base64url').toString('base64url');

  return { publicKey, privateKey };
};

export async function POST() {
  try {
    const { publicKey, privateKey } = generateKeyPairData();
    const vapidKeys = convertJwkToVapidKeys(publicKey, privateKey);

    return NextResponse.json(vapidKeys);
  } catch (error) {
    console.error('VAPID key generation failed:', error);
    return NextResponse.json({ error: ERROR_MESSAGES.GENERATE_FAILED }, { status: 500 });
  }
}
