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

/**
 * JWT トークンを検証
 */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);

    const { payload } = await jwtVerify(token, secret, {
      issuer: process.env.NEXTAUTH_URL, // Auth サービスの URL
    });

    return payload as unknown as JWTPayload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}
