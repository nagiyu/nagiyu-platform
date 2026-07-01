'use client';

import type { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';

export interface SessionProviderWrapperProps {
  children: ReactNode;
}

/**
 * next-auth の SessionProvider をラップするクライアントコンポーネント。
 * useSession（update 含む）を使うクライアントコンポーネントを包むために使う。
 * server component の getServerSession を使うページには影響しない。
 */
export default function SessionProviderWrapper({ children }: SessionProviderWrapperProps) {
  return <SessionProvider>{children}</SessionProvider>;
}
