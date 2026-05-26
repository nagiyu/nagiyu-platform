import type { CreateMessageInput, MessageEntity, MessageKey } from '../entities/message.entity.js';
import type { TokenCounter } from '../lib/token-counter.js';

/**
 * トークン上限ベースでメッセージを取得する際のオプション。
 */
export interface GetRecentByTokenBudgetOptions {
  /** ユーザー ID（Google ID） */
  userId: string;
  /** キャラクター ID（既定は `hiyori` だが呼び出し側で明示する） */
  characterId: string;
  /**
   * トークン上限。
   * 未指定時は `resolveContextTokenLimit()` の解決値を使う。
   */
  tokenLimit?: number;
  /**
   * トークン換算に使うカウンタ。
   * 未指定時は既定の `getDefaultTokenCounter()` 実装を使う。
   */
  tokenCounter?: TokenCounter;
  /**
   * 安全弁としての最大件数（DynamoDB 無限ループ防止）。
   * 既定 500 件。これに到達する前にトークン上限で打ち切られる想定。
   */
  hardLimit?: number;
}

/**
 * トークン上限ベースで取得した結果。
 */
export interface RecentMessagesResult {
  /** メッセージは時系列昇順（古い順）で返される（LLM プロンプト連結に直接使える形） */
  messages: MessageEntity[];
  /** 取得時に積み上げた合計トークン数（メッセージごとのオーバーヘッド込み） */
  totalTokens: number;
  /** トークン上限に達して打ち切ったかどうか（true なら更に古いメッセージがある可能性） */
  truncated: boolean;
}

/**
 * 会話メッセージのリポジトリ。
 *
 * Phase 2a では「保存」と「トークン上限ベースの直近取得」のみを公開する。
 * 単発取得・削除等は今後の Phase で必要になった時点で追加する。
 */
export interface MessageRepository {
  /**
   * メッセージを保存する。`MessageID` 未指定時は ULID を自動採番する。
   * TTL（90 日）はリポジトリ側で自動付与する。
   */
  create(input: CreateMessageInput): Promise<MessageEntity>;

  /**
   * 単一メッセージを取得する（主にテスト用、本番フローでは使わない）。
   */
  getById(key: MessageKey): Promise<MessageEntity | null>;

  /**
   * 直近メッセージから新しい順にスキャンし、トークン累積が上限に達した時点で打ち切る。
   * 返す配列は時系列昇順（古い順）に並び替えてある。
   */
  getRecentByTokenBudget(options: GetRecentByTokenBudgetOptions): Promise<RecentMessagesResult>;
}
