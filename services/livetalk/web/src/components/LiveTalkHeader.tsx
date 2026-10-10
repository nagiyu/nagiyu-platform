'use client';

import { useCallback, useState } from 'react';
import { SessionHeader } from '@nagiyu/ui/session-provider';
import type { NavigationItem } from '@nagiyu/ui';
import AccountDeletionModal from '@/components/AccountDeletionModal';
import { useAccountDeletion } from '@/lib/account/useAccountDeletion';

/**
 * ナビゲーション項目。
 * 権限による出し分けは Header が requiredPermission を見て行うため、ここでは静的に持つ。
 */
const NAVIGATION_ITEMS: NavigationItem[] = [
  { label: '私が覚えていること', href: '/memory' },
  { label: 'ノート', href: '/notes' },
  { label: 'ステータス', href: '/status', requiredPermission: 'livetalk:admin' },
];

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
 * リブトーク専用のヘッダー。SessionHeader に退会モーダルを組み合わせる。
 *
 * - ステータスは livetalk:admin 権限を持つユーザーにのみ表示される
 * - 退会はリブトーク固有の導線のため、モーダルの開閉 state をここで管理する
 */
export default function LiveTalkHeader({ authUrl }: LiveTalkHeaderProps) {
  // 退会・データ削除 hook
  const {
    loading: deletionLoading,
    error: deletionError,
    requestDeletion,
    clearError: clearDeletionError,
  } = useAccountDeletion(authUrl);
  const [deletionModalOpen, setDeletionModalOpen] = useState(false);

  // 退会モーダルを開く（前回の残留エラーをクリアしてから開く）
  const openDeletionModal = useCallback(() => {
    clearDeletionError();
    setDeletionModalOpen(true);
  }, [clearDeletionError]);

  return (
    <>
      <SessionHeader
        title="リブトーク"
        ariaLabel="リブトーク ホームに戻る"
        navigationItems={NAVIGATION_ITEMS}
        authUrl={authUrl}
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
