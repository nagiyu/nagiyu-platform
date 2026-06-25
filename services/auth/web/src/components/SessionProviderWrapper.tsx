'use client';

import { SessionProvider } from 'next-auth/react';

/**
 * /refresh ページ用の SessionProvider ラッパー。
 * useSession（update 含む）を利用するクライアントコンポーネントを包む。
 * dashboard など server component の getServerSession を使うページには影響を与えない。
 */
export default function SessionProviderWrapper({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
