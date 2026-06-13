'use client';

/**
 * 同意フェーズ。
 * - checking: /api/consent を確認中
 * - required: 未同意（モーダル表示）
 * - done: 同意済み
 */
export type ConsentPhase = 'checking' | 'required' | 'done';

/**
 * オンボーディングフェーズ。
 * - install: ホーム画面追加ガイド表示中
 * - notification: 通知許可リクエスト表示中
 * - null: 表示なし
 */
export type OnboardingPhase = 'install' | 'notification' | null;

/**
 * pending API のレスポンス型（キャラクターごとの未消化通知）。
 */
export interface PendingNotification {
  /** 通知元キャラクター ID */
  characterId: string;
  /** 通知 ID */
  notifId: string;
  /** 通知本文 */
  body: string;
}
