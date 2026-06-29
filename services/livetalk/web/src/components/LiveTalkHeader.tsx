'use client';

import { useCallback, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Header, buildSignOutUrl } from '@nagiyu/ui';
import { hasPermission } from '@nagiyu/common';
import AccountDeletionModal from '@/components/AccountDeletionModal';
import { useAccountDeletion } from '@/lib/account/useAccountDeletion';

export interface LiveTalkHeaderProps {
  /**
   * auth サービスのベース URL。
   * サインアウト URL の生成に使用する。
   * サーバーコンポーネント（layout.tsx）でランタイム env から解決して渡す。
   * client component 内で process.env.NEXT_PUBLIC_AUTH_URL を参照すると
   * ビルド時インライン化により空文字になるため、この方式で正しい絶対 URL を保証する。
   */
  authUrl: string;
}

/**
 * リブトーク専用の Header ラッパーコンポーネント。
 *
 * - ナビゲーション項目（私が覚えていること・ノート・ステータス）を Header に渡す
 * - ステータスは livetalk:admin ロールを持つユーザーにのみ表示する
 * - サインアウト・退会モーダルをアカウントメニューに集約する
 * - AccountDeletionModal の開閉 state をここで管理する
 */
export default function LiveTalkHeader({ authUrl }: LiveTalkHeaderProps) {
  const { data: session } = useSession();

  // ロール判定（HomePageClient の既存ロジックを踏襲）
  const isAdmin =
    !!session?.user &&
    'roles' in session.user &&
    Array.isArray(session.user.roles) &&
    hasPermission(session.user.roles, 'livetalk:admin');

  // ナビゲーション項目の構築
  const navigationItems = [
    { label: '私が覚えていること', href: '/memory' },
    { label: 'ノート', href: '/notes' },
    ...(isAdmin ? [{ label: 'ステータス', href: '/status' }] : []),
  ];

  // ユーザー情報（セッションから取得）
  const user = session?.user
    ? {
        name: session.user.name ?? '',
        email: session.user.email ?? undefined,
        avatar: session.user.image ?? undefined,
      }
    : undefined;

  // サインアウト処理は Cookie 発行元の auth サービスに集約する方針のため、
  // 自サービスの NextAuth signout POST ではなく auth サービスへリダイレクトする。
  // callbackUrl に自サービスの origin を渡し、サインアウト後に戻れるようにする。
  // authUrl はサーバーコンポーネント（layout.tsx）でランタイム env から解決して prop で受け取る。
  // client component 内で process.env.NEXT_PUBLIC_AUTH_URL を参照すると
  // ビルド時インライン化により空文字になるため、この方式で正しい絶対 URL を保証する。
  const handleLogout = useCallback(() => {
    window.location.assign(buildSignOutUrl(authUrl, window.location.origin));
  }, [authUrl]);

  // 退会・データ削除 hook
  const {
    loading: deletionLoading,
    error: deletionError,
    requestDeletion,
    clearError: clearDeletionError,
  } = useAccountDeletion();
  const [deletionModalOpen, setDeletionModalOpen] = useState(false);

  // 退会モーダルを開く（前回の残留エラーをクリアしてから開く）
  const openDeletionModal = useCallback(() => {
    clearDeletionError();
    setDeletionModalOpen(true);
  }, [clearDeletionError]);

  return (
    <>
      <Header
        title="リブトーク"
        ariaLabel="リブトーク ホームに戻る"
        navigationItems={navigationItems}
        user={user}
        onLogout={handleLogout}
        onDeleteAccount={openDeletionModal}
      />
      <AccountDeletionModal
        open={deletionModalOpen}
        loading={deletionLoading}
        error={deletionError}
        onConfirm={requestDeletion}
        onCancel={() => setDeletionModalOpen(false)}
      />
    </>
  );
}
