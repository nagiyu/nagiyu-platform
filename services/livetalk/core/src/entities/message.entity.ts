/**
 * 会話メッセージ 1 件を表すビジネスオブジェクト。
 *
 * `docs/services/livetalk/architecture.md` §3「データモデル概要」に対応：
 *   - 1 メッセージ = 1 item（配列保持禁止）
 *   - 並べ替え用 ID は ULID（時系列順）
 *
 * DynamoDB 上の attribute は PascalCase で保存し、エンティティは camelCase で表す。
 * 名前の対応づけは Mapper が担う。
 *
 * Phase 2a スコープでは音声 / トークン / レイテンシ / モーション系のメタは
 * 保持しない（design.md の `meta` 相当）。Phase 2c の LLM 統合 / VOICEVOX
 * パイプライン構築時に必要なフィールドだけ追加する方針。
 */
export interface MessageEntity {
  /** ユーザー識別子（Google ID をそのまま使う） */
  userId: string;
  /** キャラクター識別子（例: `hiyori`） */
  characterId: string;
  /** メッセージ ID（ULID、時系列ソート可能） */
  messageId: string;
  /** 発言者 */
  role: 'user' | 'assistant';
  /** メッセージ本文 */
  text: string;
  /** 作成 / 更新時刻（Unix ms） */
  createdAt: number;
  updatedAt: number;
  /** 自動削除する時刻 (Unix ms)。保存時は TTL 属性のエポック秒になる */
  expiresAt?: number;
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
 * メッセージ作成入力（`createdAt` / `updatedAt` / `expiresAt` はリポジトリ側で付与）。
 * messageId も省略可能：未指定なら ULID を自動採番する。
 */
export type CreateMessageInput = Omit<
  MessageEntity,
  'messageId' | 'createdAt' | 'updatedAt' | 'expiresAt'
> & {
  /** 明示的に ULID を指定したい場合のみ渡す（テスト用途） */
  messageId?: string;
};
