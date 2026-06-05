import type {
  CreateStudyTopicInput,
  StudyTopicEntity,
  UpdateStudyTopicInput,
} from '../entities/study-topic.entity.js';

export interface StudyTopicRepository {
  put(input: CreateStudyTopicInput): Promise<StudyTopicEntity>;
  /** Status でフィルタして Priority 降順で返す。未指定時は全件。 */
  listByStatus(
    userId: string,
    characterId: string,
    status?: StudyTopicEntity['Status']
  ): Promise<StudyTopicEntity[]>;
  /** Status / Priority を更新する */
  updateStatus(input: UpdateStudyTopicInput): Promise<StudyTopicEntity>;
  /** 同じ Topic が pending / in_progress で既に存在するか確認する（重複登録防止） */
  findPendingByTopic(
    userId: string,
    characterId: string,
    topic: string
  ): Promise<StudyTopicEntity | null>;
}
