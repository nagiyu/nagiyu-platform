export interface ConsentRecord {
  Version: string;
  AgreedAt: number; // Unix ms
}

export interface AgeVerification {
  Value: boolean;
  VerifiedAt: number; // Unix ms
}

export interface UserConsents {
  TermsAgreed?: ConsentRecord;
  PrivacyAgreed?: ConsentRecord;
  AgeVerified?: AgeVerification;
}

/**
 * リブトークが独自に保持するユーザープロファイル。
 *
 * 表示名 / メール / Google ID 等の認証側情報はここに持たない：
 *   - Google ID は `UserID` と同値（セッションの `user.googleId` をそのまま使う）ため重複
 *   - 表示名 / メールは Auth サービスのセッションから都度取得できる
 *   - PII を LiveTalk 側に複製しないことで漏洩時の影響範囲を縮小する
 *
 * よって LiveTalk が単独で必要とする属性のみ保持する：
 *   - 最初にリブトークを開いた時刻（`CreatedAt`）
 *   - 最後にリブトークを開いた時刻（`LastActiveAt`、久しぶり挨拶等で参照）
 */
export interface ProfileEntity {
  /** ユーザー識別子（= Google ID。セッションから供給される） */
  UserID: string;
  /** 最終アクセス時刻（Unix ms） */
  LastActiveAt: number;
  /** リブトーク初回登録時刻 / 更新時刻（Unix ms） */
  CreatedAt: number;
  UpdatedAt: number;
  Consents?: UserConsents;
}

export interface ProfileKey {
  userId: string;
}

/**
 * 初回登録時の入力。
 * `LastActiveAt` を省略した場合は呼び出し時刻が採用される。
 */
export interface CreateProfileInput {
  UserID: string;
  LastActiveAt?: number;
}

/**
 * 既存プロファイルへの差分更新。Phase 2a では `LastActiveAt` のみ。
 */
export interface UpdateProfileInput {
  LastActiveAt?: number;
  Consents?: UserConsents;
}
