/**
 * 会話中に「勉強しておくね」と返したトピックのキュー。
 *
 * Phase 5b（#3344）chat-usecase の知識ゲートが書き込む。
 * 勉強バッチ（Phase 5a）がこのキューを優先的に処理する。
 * DynamoDB SK: `CHAR#<charId>#STUDY#<ulid>`
 */
export interface StudyTopicEntity {
  userId: string;
  characterId: string;
  /** ULID（時系列ソート可能） */
  topicId: string;
  /** 勉強が必要と判定されたトピック名 */
  topic: string;
  /**
   * 優先度（高いほど先に処理）。
   * 強制ゲート経由は priority=10、通常勉強は 1。
   */
  priority: number;
  status: 'pending' | 'in_progress' | 'done';
  createdAt: number;
  updatedAt: number;
  /** 自動削除する時刻 (Unix ms)。保存時は TTL 属性のエポック秒になる */
  expiresAt?: number;
}

export interface StudyTopicKey {
  userId: string;
  characterId: string;
  topicId: string;
}

export type CreateStudyTopicInput = Omit<StudyTopicEntity, 'createdAt' | 'updatedAt'>;
export type UpdateStudyTopicInput = Pick<
  StudyTopicEntity,
  'userId' | 'characterId' | 'topicId' | 'status' | 'priority'
> &
  Partial<Pick<StudyTopicEntity, 'expiresAt'>>;
