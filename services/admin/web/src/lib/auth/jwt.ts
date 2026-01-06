import { jwtVerify } from 'jose';

export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  roles: string[];
  exp: number;
  iat: number;
}

const ERROR_MESSAGES = {
  MISSING_NEXTAUTH_SECRET: 'NEXTAUTH_SECRET 環境変数が設定されていません',
  MISSING_NEXTAUTH_URL: 'NEXTAUTH_URL 環境変数が設定されていません',
  JWT_VERIFICATION_FAILED: 'JWT検証に失敗しました',
} as const;

/**
 * JWT トークンを検証
 */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  // 環境変数の存在確認
  if (!process.env.NEXTAUTH_SECRET) {
    console.error(ERROR_MESSAGES.MISSING_NEXTAUTH_SECRET);
    return null;
  }

  if (!process.env.NEXTAUTH_URL) {
    console.error(ERROR_MESSAGES.MISSING_NEXTAUTH_URL);
    return null;
  }

  try {
    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);

    const { payload } = await jwtVerify(token, secret, {
      issuer: process.env.NEXTAUTH_URL, // Auth サービスの URL
    });

    return payload as unknown as JWTPayload;
  } catch (error) {
    console.error(ERROR_MESSAGES.JWT_VERIFICATION_FAILED, error);
    return null;
  }
}
