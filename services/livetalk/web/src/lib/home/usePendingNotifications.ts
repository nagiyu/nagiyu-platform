'use client';

import { useEffect, useState } from 'react';
import type { PendingNotification } from './types';

/**
 * usePendingNotifications の戻り値型。
 */
export interface UsePendingNotificationsResult {
  /** カレント以外の未消化通知一覧 */
  pendingNotifications: PendingNotification[];
}

/**
 * マウント時に /api/push/pending を取得し、他キャラクターの未消化通知一覧を返すカスタム hook。
 *
 * このエフェクトはマウント時（初回起動）にのみ実行する。
 */
export function usePendingNotifications(): UsePendingNotificationsResult {
  const [pendingNotifications, setPendingNotifications] = useState<PendingNotification[]>([]);

  // 自前起動時: カレント以外に未消化通知があれば提示する。
  // このエフェクトはマウント時（初回起動）にのみ実行する。
  useEffect(() => {
    fetch('/api/push/pending')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PendingNotification[] | null) => {
        if (!data || data.length === 0) return;
        setPendingNotifications(data);
      })
      .catch(() => {});
    // マウント時のみ実行（依存配列は空）
  }, []);

  return { pendingNotifications };
}
