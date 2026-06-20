/**
 * マイリスト登録フォームの型定義
 */

/**
 * マイリスト登録フォームの入力データ
 *
 * Phase 2: userSession フィールドを撤去。セッションはサーバー側保存済みのものを使用する。
 */
export interface MylistRegisterFormData {
  /** 登録する最大動画数（1-100） */
  maxCount: number;
  /** お気に入りのみを対象とするか */
  favoriteOnly: boolean;
  /** スキップ動画を除外するか */
  excludeSkip: boolean;
  /** マイリスト名 */
  mylistName: string;
}

/**
 * マイリスト登録フォームのデフォルト値
 */
export const DEFAULT_MYLIST_REGISTER_FORM_DATA: MylistRegisterFormData = {
  maxCount: 100,
  favoriteOnly: false,
  excludeSkip: true,
  mylistName: '',
};

/**
 * マイリスト登録 API リクエスト
 *
 * Phase 2: userSession フィールドを撤去。
 */
export interface MylistRegisterRequest {
  maxCount: number;
  favoriteOnly?: boolean;
  excludeSkip?: boolean;
  mylistName: string;
  pushSubscription?: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
}

/**
 * マイリスト登録 API レスポンス
 */
export interface MylistRegisterResponse {
  jobId: string;
  selectedCount: number;
}

/**
 * ニコニコセッション状態
 */
export interface NiconicoSessionStatus {
  /** セッションが保存されているか */
  hasSession: boolean;
  /** セッションの有効性（保存セッションがない場合は undefined） */
  validity: 'valid' | 'invalid' | 'unknown' | undefined;
  /** セッション取得日時（epoch ms） */
  acquiredAt: number | undefined;
  /** セッション推定有効期限（epoch ms） */
  estimatedExpiresAt: number | undefined;
}
