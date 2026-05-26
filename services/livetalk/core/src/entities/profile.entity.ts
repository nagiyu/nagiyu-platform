/**
 * ユーザープロファイル（リブトーク内部で保持する最小情報）。
 *
 * `tasks/livetalk/design.md` 3.1 / 3.2 節 の `User` に対応する。
 * Auth サービスの session から得られる情報を必要に応じてキャッシュする位置づけ。
 */
export interface ProfileEntity {
  /** ユーザー識別子（Google ID） */
  UserID: string;
  /** Google ID（UserID と同値でも明示的に持つ：将来の認証方式拡張時の保険） */
  GoogleID: string;
  /** 表示名（Google プロフィール由来） */
  DisplayName: string;
  /** Email（PII：ログ等への露出禁止） */
  Email: string;
  /** 最終アクセス時刻（Unix ms） */
  LastActiveAt: number;
  /** 作成 / 更新時刻（Unix ms） */
  CreatedAt: number;
  UpdatedAt: number;
}

export interface ProfileKey {
  userId: string;
}

export type CreateProfileInput = Omit<ProfileEntity, 'CreatedAt' | 'UpdatedAt'>;
export type UpdateProfileInput = Partial<
  Pick<ProfileEntity, 'DisplayName' | 'Email' | 'LastActiveAt'>
>;
