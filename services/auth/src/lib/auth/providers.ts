import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import type { Provider } from 'next-auth/providers';

export function getAuthProviders(): Provider[] {
  // E2E/テスト環境ではCredentialsプロバイダーを使用
  if (process.env.AUTH_PROVIDER === 'mock' || process.env.E2E_TEST === 'true') {
    return [
      Credentials({
        id: 'mock-google',
        name: 'Mock Google OAuth',
        credentials: {
          email: { label: 'Email', type: 'email' },
          name: { label: 'Name', type: 'text' },
        },
        async authorize(credentials) {
          // テスト用: 任意のユーザーで認証成功
          if (!credentials?.email) return null;

          return {
            id: `mock-${credentials.email}`,
            email: credentials.email as string,
            name: (credentials.name as string) || 'Test User',
            image: 'https://example.com/avatar.jpg',
          };
        },
      }),
    ];
  }

  // 本番環境: Google OAuth
  return [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),
  ];
}
