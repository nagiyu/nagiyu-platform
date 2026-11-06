'use client';

import { createContext, useContext, type ReactNode } from 'react';

const AuthUrlContext = createContext('');

type AuthUrlProviderProps = {
  /** サーバーのランタイム env から解決した auth サービスのベース URL */
  authUrl: string;
  children: ReactNode;
};

/**
 * クライアントコンポーネントへ auth サービスの URL を渡す。
 * クライアントで env を直接読むとビルド時に空文字へ固定されるため、サーバーで解決した値を経由させる。
 */
export function AuthUrlProvider({ authUrl, children }: AuthUrlProviderProps) {
  return <AuthUrlContext.Provider value={authUrl}>{children}</AuthUrlContext.Provider>;
}

export const useAuthUrl = (): string => useContext(AuthUrlContext);
