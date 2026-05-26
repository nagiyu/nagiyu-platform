/**
 * 会話メッセージ 1 件を表すビジネスオブジェクト。
 *
 * `tasks/livetalk/design.md` 3.1 / 3.2 節に対応：
 *   - 1 メッセージ = 1 item（配列保持禁止）
 *   - 並べ替え用 ID は ULID（時系列順）
 *   - audio S3 key / 各種メタは optional
 *
 * DynamoDB 上の attribute はすべて PascalCase（プラットフォーム共通ルール）で
 * 保存する。エンティティ側もそれに合わせて PascalCase で表現している。
 */
export interface MessageEntity {
  /** ユーザー識別子（Google ID をそのまま使う） */
  UserID: string;
  /** キャラクター識別子（例: `hiyori`） */
  CharacterID: string;
  /** メッセージ ID（ULID、時系列ソート可能） */
  MessageID: string;
  /** 発言者 */
  Role: 'user' | 'assistant';
  /** メッセージ本文 */
  Text: string;
  /** 合成音声を保管する S3 key（任意、Phase 2c 以降で利用） */
  AudioS3Key?: string;
  /** LLM で消費したトークン数（任意、Phase 2c 以降で利用） */
  TokenCount?: number;
  /** 応答時間 ms（任意、Phase 2c 以降で利用） */
  LatencyMs?: number;
  /** 採用したモーション名（任意、Phase 2c 以降で利用） */
  MotionUsed?: string;
  /** 作成 / 更新時刻（Unix ms） */
  CreatedAt: number;
  UpdatedAt: number;
}

/**
 * 単一メッセージを取得する際のキー。
 */
export interface MessageKey {
  userId: string;
  characterId: string;
  messageId: string;
}

/**
 * メッセージ作成入力（`CreatedAt` / `UpdatedAt` はリポジトリ側で付与）。
 * MessageID も省略可能：未指定なら ULID を自動採番する。
 */
export type CreateMessageInput = Omit<MessageEntity, 'MessageID' | 'CreatedAt' | 'UpdatedAt'> & {
  /** 明示的に ULID を指定したい場合のみ渡す（テスト用途） */
  MessageID?: string;
};
