/**
 * マイリスト登録フォームの型定義
 */

/**
 * マイリスト登録フォームの入力データ
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
  /** ニコニコ動画の user_session クッキー値 */
  userSession: string;
}

/**
 * マイリスト登録フォームのデフォルト値
 */
export const DEFAULT_MYLIST_REGISTER_FORM_DATA: MylistRegisterFormData = {
  maxCount: 100,
  favoriteOnly: false,
  excludeSkip: true,
  mylistName: '',
  userSession: '',
};

/**
 * マイリスト登録APIリクエスト
 */
export interface MylistRegisterRequest {
  maxCount: number;
  favoriteOnly?: boolean;
  excludeSkip?: boolean;
  mylistName: string;
  /** ニコニコ動画の user_session クッキー値 */
  userSession: string;
  pushSubscription?: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
}

/**
 * マイリスト登録APIレスポンス
 */
export interface MylistRegisterResponse {
  jobId: string;
  selectedCount: number;
}
