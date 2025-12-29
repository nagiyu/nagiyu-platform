import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import type { NextAuthConfig } from 'next-auth';
import { UserRepository } from '@/lib/repositories/UserRepository';

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
        domain: process.env.COOKIE_DOMAIN || '.nagiyu.com', // SSO: すべてのサブドメインで有効
        secure: true,
      },
    },
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!account || !user.email) {
        return false;
      }

      try {
        // DynamoDB にユーザーを保存/更新
        const userRepo = new UserRepository();
        await userRepo.upsertUser({
          googleId: account.providerAccountId,
          email: user.email,
          name: user.name || '',
          picture: user.image,
        });
        return true;
      } catch (error) {
        console.error('Error during sign in:', error);
        return false;
      }
    },
    async jwt({ token, user, account }) {
      if (account && user) {
        token.googleId = account.providerAccountId;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;

        // DynamoDB からユーザー情報取得してロールを追加
        try {
          const userRepo = new UserRepository();
          const dbUser = await userRepo.getUserByGoogleId(account.providerAccountId);
          token.userId = dbUser?.userId;
          token.roles = dbUser?.roles || [];
        } catch (error) {
          console.error('Error fetching user roles:', error);
          token.roles = [];
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
