/**
 * 集約（consolidation）バッチの進捗カーソル（リブトーク知識再設計 P1 / #3697）。
 *
 * Message / WebRaw のうち、前回集約済みの位置（Unix ms）を保持する。
 * キャラ単位で固定・1 item。
 *
 * DynamoDB SK: `CHAR#<charId>#CURSOR`
 */
export interface ConsolidationCursorEntity {
  UserID: string;
  CharacterID: string;
  /** 前回集約済みの Message CreatedAt（Unix ms） */
  MsgCursor: number;
  /** 前回集約済みの WebRaw CreatedAt（Unix ms） */
  WebrawCursor: number;
  UpdatedAt: number;
}

/**
 * カーソルを取得する際のキー。
 */
export interface ConsolidationCursorKey {
  userId: string;
  characterId: string;
}

/**
 * カーソル作成/更新入力（`UpdatedAt` はリポジトリ側で付与）。
 */
export type PutConsolidationCursorInput = Omit<ConsolidationCursorEntity, 'UpdatedAt'>;
