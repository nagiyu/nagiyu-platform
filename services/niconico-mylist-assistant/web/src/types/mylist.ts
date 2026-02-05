/**
 * マイリスト登録フォームの型定義
 */

/**
 * マイリスト登録フォームの入力データ
 */
export interface MylistRegisterFormData {
  /** 登録する最大動画数（1-50） */
  maxCount: number;
  /** お気に入りのみを対象とするか */
  favoriteOnly: boolean;
  /** スキップ動画を除外するか */
  excludeSkip: boolean;
  /** マイリスト名 */
  mylistName: string;
  /** ニコニコアカウントのメールアドレス */
  niconicoEmail: string;
  /** ニコニコアカウントのパスワード */
  niconicoPassword: string;
}

/**
 * マイリスト登録フォームのデフォルト値
 */
export const DEFAULT_MYLIST_REGISTER_FORM_DATA: MylistRegisterFormData = {
  maxCount: 10,
  favoriteOnly: false,
  excludeSkip: true,
  mylistName: '',
  niconicoEmail: '',
  niconicoPassword: '',
};

/**
 * マイリスト登録APIリクエスト
 */
export interface MylistRegisterRequest {
  maxCount: number;
  favoriteOnly?: boolean;
  excludeSkip?: boolean;
  mylistName: string;
  niconicoAccount: {
    email: string;
    password: string;
  };
}

/**
 * マイリスト登録APIレスポンス
 */
export interface MylistRegisterResponse {
  jobId: string;
  selectedCount: number;
}
