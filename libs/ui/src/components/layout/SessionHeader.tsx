'use client';

import { useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@mui/material';
import Header from './Header';
import type { HeaderProps } from './Header';
import { buildSignInUrl, buildSignOutUrl } from '../../utils/auth';

export type SessionHeaderProps = Omit<HeaderProps, 'user' | 'roles' | 'onLogout'> & {
  /**
   * auth サービスのベース URL。
   * ランタイムの環境変数から解決する必要があるため、クライアントでは読まず、
   * サーバー側の layout が解決した値を props で受け取る。
   */
  authUrl: string;
  /**
   * 未ログインのときにログインボタンを actions に出すか。
   * ログインが任意のサービスで、ログインの入口が他に無い場合に true にする。
   * 既存サービスのヘッダーの見た目を変えないよう、既定は false。
   * @default false
   */
  showSignIn?: boolean;
};

/**
 * next-auth のセッションから Header の user / roles / onLogout を組み立てるラッパー。
 *
 * サービスごとに重複していた「セッション → Header props の変換」と
 * 「auth サービスのサインアウト URL への遷移」を一箇所に集約する。
 * 未ログイン・読み込み中は user / onLogout を渡さないため、アカウントメニューは出ない。
 */
export default function SessionHeader({
  authUrl,
  showSignIn = false,
  ...headerProps
}: SessionHeaderProps) {
  const { data: session, status } = useSession();
  const sessionUser = session?.user;

  // サインアウトは Cookie 発行元の auth サービスに集約しているため、
  // 現在のオリジンを戻り先にして auth 側の signout へ遷移する。
  const handleLogout = useCallback(() => {
    window.location.assign(buildSignOutUrl(authUrl, window.location.origin));
  }, [authUrl]);

  // 現在の URL を戻り先にして auth 側のサインインへ遷移する。
  const handleSignIn = useCallback(() => {
    window.location.assign(buildSignInUrl(authUrl, window.location.href));
  }, [authUrl]);

  if (!sessionUser) {
    // 読み込み中に出すと、ログイン済みの利用者に一瞬ログインボタンが見えてしまう。
    if (!showSignIn || status !== 'unauthenticated') {
      return <Header {...headerProps} />;
    }

    return (
      <Header
        {...headerProps}
        actions={
          <>
            {headerProps.actions}
            <Button color="inherit" onClick={handleSignIn} sx={{ ml: 2 }}>
              ログイン
            </Button>
          </>
        }
      />
    );
  }

  // roles は next-auth の型拡張に依存せず、配列であることを実行時に確認して受け取る。
  const roles = (sessionUser as { roles?: unknown }).roles;

  return (
    <Header
      {...headerProps}
      user={{
        name: sessionUser.name ?? '',
        email: sessionUser.email ?? undefined,
        avatar: sessionUser.image ?? undefined,
      }}
      roles={Array.isArray(roles) ? roles : undefined}
      onLogout={handleLogout}
    />
  );
}
