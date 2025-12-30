import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import type { NextAuthConfig } from 'next-auth';
import { InMemoryUserRepository } from '../repositories/in-memory-user-repository';

// NOTE: InMemoryUserRepository は開発・テスト専用のユーザーリポジトリです。
// - メモリ内にのみデータを保持し、プロセス終了時にデータは失われます。
// - 開発環境のホットリロード時にはメモリ上のデータが蓄積し続ける可能性があります。
// - 複数のサーバーレス関数インスタンス間でデータは共有されません。
// 本番環境では永続化されたユーザーデータストアを利用するように実装を切り替えてください。
const userRepository = new InMemoryUserRepository();

export const authConfig: NextAuthConfig = {
  providers: [
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
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        domain: '.nagiyu.com',
        secure: true,
      },
    },
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!account) {
        return false;
      }

      await userRepository.upsertUser({
        googleId: account.providerAccountId,
        email: user.email!,
        name: user.name!,
        picture: user.image,
      });

      return true;
    },
    async jwt({ token, user, account }) {
      if (account && user) {
        token.googleId = account.providerAccountId;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;

        const dbUser = await userRepository.getUserByGoogleId(account.providerAccountId);
        token.userId = dbUser?.userId;
        token.roles = dbUser?.roles || [];

        if (dbUser) {
          await userRepository.updateLastLogin(dbUser.userId);
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = (token.userId as string) || '';
      session.user.email = (token.email as string) || '';
      session.user.name = (token.name as string) || '';
      session.user.image = (token.picture as string) || undefined;
      session.user.roles = (token.roles as string[]) || [];
      return session;
    },
  },
  pages: {
    signIn: '/signin',
    error: '/auth/error',
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
