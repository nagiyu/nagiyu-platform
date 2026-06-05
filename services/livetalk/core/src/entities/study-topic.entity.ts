/**
 * 会話中に「勉強しておくね」と返したトピックのキュー。
 *
 * Phase 5b（#3344）chat-usecase の知識ゲートが書き込む。
 * 勉強バッチ（Phase 5a）がこのキューを優先的に処理する。
 * DynamoDB SK: `CHAR#<charId>#STUDY#<ulid>`
 */
export interface StudyTopicEntity {
  UserID: string;
  CharacterID: string;
  /** ULID（時系列ソート可能） */
  TopicID: string;
  /** 勉強が必要と判定されたトピック名 */
  Topic: string;
  /**
   * 優先度（高いほど先に処理）。
   * 強制ゲート経由は priority=10、通常勉強は 1。
   */
  Priority: number;
  Status: 'pending' | 'in_progress' | 'done';
  CreatedAt: number;
  UpdatedAt: number;
  /** TTL（Unix 秒）。30 日後に自動削除 */
  Ttl?: number;
}

export interface StudyTopicKey {
  userId: string;
  characterId: string;
  topicId: string;
}

export type CreateStudyTopicInput = Omit<StudyTopicEntity, 'CreatedAt' | 'UpdatedAt'>;
export type UpdateStudyTopicInput = Pick<
  StudyTopicEntity,
  'UserID' | 'CharacterID' | 'TopicID' | 'Status' | 'Priority'
> &
  Partial<Pick<StudyTopicEntity, 'Ttl'>>;
