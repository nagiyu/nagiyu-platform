export interface ConsentRecord {
  version: string;
  /** 同意時刻 (Unix ms) */
  agreedAt: number;
}

export interface AgeVerification {
  value: boolean;
  /** 自己申告時刻 (Unix ms) */
  verifiedAt: number;
}

export interface UserConsents {
  termsAgreed?: ConsentRecord;
  privacyAgreed?: ConsentRecord;
  ageVerified?: AgeVerification;
}

/**
 * リブトークが独自に保持するユーザープロファイル。
 *
 * 表示名 / メール等の認証側情報はここに持たない:
 *   - ユーザー ID は `userId` と同値 (セッションの `user.id` をそのまま使う) ため重複
 *   - 表示名 / メールは Auth サービスのセッションから都度取得できる
 *   - PII を LiveTalk 側に複製しないことで漏洩時の影響範囲を縮小する
 *
 * よって LiveTalk が単独で必要とする属性のみ保持する:
 *   - 最初にリブトークを開いた時刻 (`createdAt`)
 *   - 最後にリブトークを開いた時刻 (`lastActiveAt`、久しぶり挨拶等で参照)
 */
export interface ProfileEntity {
  /** ユーザー識別子 (= Google ID。セッションから供給される) */
  userId: string;
  /** 最終アクセス時刻 (Unix ms) */
  lastActiveAt: number;
  /** リブトーク初回登録時刻 / 更新時刻 (Unix ms) */
  createdAt: number;
  updatedAt: number;
  consents?: UserConsents;
}

export interface ProfileKey {
  userId: string;
}

/**
 * 初回登録時の入力。
 * `lastActiveAt` を省略した場合は呼び出し時刻が採用される。
 */
export interface CreateProfileInput {
  userId: string;
  lastActiveAt?: number;
}

/** 既存プロファイルへの差分更新。 */
export interface UpdateProfileInput {
  lastActiveAt?: number;
  consents?: UserConsents;
}
