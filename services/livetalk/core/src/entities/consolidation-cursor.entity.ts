/**
 * 集約（consolidation）バッチの進捗カーソル。
 *
 * Message / WebRaw のうち、前回集約済みの位置（Unix ms）を保持する。
 * キャラ単位で固定・1 item。
 *
 * DynamoDB SK: `CHAR#<charId>#CURSOR`
 */
export interface ConsolidationCursorEntity {
  userId: string;
  characterId: string;
  /** 前回集約済みの Message createdAt（Unix ms） */
  msgCursor: number;
  /** 前回集約済みの WebRaw createdAt（Unix ms） */
  webrawCursor: number;
  updatedAt: number;
}

/**
 * カーソルを取得する際のキー。
 */
export interface ConsolidationCursorKey {
  userId: string;
  characterId: string;
}

/**
 * カーソル作成/更新入力（`updatedAt` はリポジトリ側で付与）。
 */
export type PutConsolidationCursorInput = Omit<ConsolidationCursorEntity, 'updatedAt'>;
