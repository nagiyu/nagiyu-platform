import 'next-auth';
import type { SessionUser } from '@nagiyu/common';

declare module 'next-auth' {
  interface Session {
    user: SessionUser;
  }

  interface User {
    id: string;
    email: string;
    name: string;
    image?: string;
    roles?: string[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    googleId?: string;
    email?: string;
    name?: string;
    picture?: string;
    roles?: string[];
    /** ロールを最後に DB から取得した epoch ms */
    rolesRefreshedAt?: number;
  }
}
