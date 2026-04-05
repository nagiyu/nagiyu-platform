import type { VapidConfig } from './types.js';

/**
 * Web Push 通知用の VAPID 設定を返す。
 *
 * 環境変数から VAPID キーを読み込む。
 * この関数はサーバーサイド（バッチ・バックエンド）でのみ使用すること。
 * VAPID 秘密鍵をクライアントサイドに露出してはならない。
 *
 * @returns publicKey、privateKey、subject を含む VapidConfig オブジェクト
 */
export function getVapidConfig(): VapidConfig {
  return {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    subject: 'mailto:support@nagiyu.com',
  };
}
