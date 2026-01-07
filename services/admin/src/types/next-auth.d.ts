import { DefaultSession, DefaultJWT } from 'next-auth';
import { DefaultJWT as JWT } from 'next-auth/jwt';

declare module 'next-auth' {
  /**
   * セッション情報の拡張
   */
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string;
      roles: string[];
    } & DefaultSession['user'];
  }

  /**
   * ユーザー情報の拡張
   */
  interface User {
    id: string;
    email: string;
    name: string;
    image?: string;
    roles?: string[];
  }
}

declare module 'next-auth/jwt' {
  /**
   * JWT トークンの拡張
   */
  interface JWT extends DefaultJWT {
    userId?: string;
    googleId?: string;
    email?: string;
    name?: string;
    picture?: string;
    roles?: string[];
  }
}
