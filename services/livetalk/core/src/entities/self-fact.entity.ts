/**
 * Topic に紐づく SELF fact（ユーザー自身についての事実）。
 *
 * `TopicEntity` 配下に同居する 1 fact = 1 item。誤マージが判明した際に
 * 出所（provenance）から可逆化できるようにするための出所メモを持つ。
 *
 * DynamoDB SK: `CHAR#<charId>#TOPIC#<topicId>#SELF#<factId>`
 */
export interface SelfFactEntity {
  userId: string;
  characterId: string;
  topicId: string;
  /** Fact ID（ULID、時系列ソート可能） */
  factId: string;
  /** fact 本文 */
  text: string;
  /**
   * 出所メモ（誤マージ可逆化用）。どのメッセージ・文脈から抽出したかを記録する。
   * 空文字を許可する（出所が特定できない場合）。
   */
  provenance: string;
  createdAt: number;
}

/**
 * 単一 SELF fact を取得する際のキー。
 */
export interface SelfFactKey {
  userId: string;
  characterId: string;
  topicId: string;
  factId: string;
}

/**
 * SELF fact 作成入力（`createdAt` はリポジトリ側で付与）。
 * factId も省略可能：未指定なら ULID を自動採番する。
 */
export type CreateSelfFactInput = Omit<SelfFactEntity, 'factId' | 'createdAt'> & {
  /** 明示的に ULID を指定したい場合のみ渡す（テスト用途） */
  factId?: string;
};
