import { logger, toErrorMessage } from '@nagiyu/common';
import {
  getAllCharacterIds,
  getCharacterDefinitionById,
  generateNotesForUser,
  studyForUser,
  type InterestRepository,
  type KnowledgeRepository,
  type LifecycleRepository,
  type NoteRepository,
  type ProfileRepository,
  type UlidFactory,
} from '@nagiyu/livetalk-core';
import type { IResearchClient } from '@nagiyu/livetalk-core';

export interface StudyAllUsersParams {
  profileRepo: ProfileRepository;
  lifecycleRepo: LifecycleRepository;
  interestRepo: InterestRepository;
  knowledgeRepo: KnowledgeRepository;
  /**
   * Note リポジトリ（Phase 5c / #3345）。
   * 指定された場合、勉強が実行されたユーザーについて KNOWLEDGE → NOTE 昇格を行う。
   */
  noteRepo?: NoteRepository;
  researchClient: IResearchClient;
  ulidFactory?: UlidFactory;
  now?: () => Date;
}

export interface StudyAllUsersResult {
  studiedUsers: number;
  skippedUsers: number;
  failedUsers: number;
  failedUserIds: string[];
  /** 生成されたノートの総数（Phase 5c） */
  generatedNotes: number;
}

/**
 * 全アクティブユーザーに対して勉強バッチを実行する。
 *
 * ProfileRepository（GSI1）でユーザーを列挙し、各ユーザーについて全キャラクターを走査し、
 * shouldStudyNow 判定を行い、該当するキャラクターのみ Web リサーチ → 知識ベース保存を実行する。
 * あるキャラクターで失敗しても他キャラクターの処理は継続する。
 */
export async function studyAllUsers(params: StudyAllUsersParams): Promise<StudyAllUsersResult> {
  const {
    profileRepo,
    lifecycleRepo,
    interestRepo,
    knowledgeRepo,
    noteRepo,
    researchClient,
    ulidFactory,
    now,
  } = params;

  const userIds = await profileRepo.listAllUserIds();

  logger.info('[studyAllUsers] ユーザー一覧取得完了', { userCount: userIds.length });

  const result: StudyAllUsersResult = {
    studiedUsers: 0,
    skippedUsers: 0,
    failedUsers: 0,
    failedUserIds: [],
    generatedNotes: 0,
  };

  const allCharacterIds = getAllCharacterIds();

  for (const userId of userIds) {
    let hasCharacterError = false;
    let hasStudied = false;

    try {
      for (const characterId of allCharacterIds) {
        const characterDef = getCharacterDefinitionById(characterId);
        if (!characterDef) {
          logger.warn('[studyAllUsers] キャラクター定義が見つかりません（スキップ）', {
            characterId,
          });
          continue;
        }

        try {
          const lifecycle = await lifecycleRepo.get({ userId, characterId });
          if (!lifecycle) {
            // lifecycle 未登録のキャラクターはスキップ（計上しない）
            continue;
          }

          const outcome = await studyForUser(userId, characterId, {
            knowledgeRepo,
            interestRepo,
            researchClient,
            character: characterDef,
            lifecycle,
            ulidFactory,
            now,
          });

          if (outcome.outcome === 'studied') {
            hasStudied = true;

            // KNOWLEDGE → NOTE 昇格（Phase 5c）。
            // fail-warn: ノート生成の失敗は勉強バッチ全体を止めない。
            if (noteRepo) {
              try {
                const noteResult = await generateNotesForUser(userId, characterId, {
                  knowledgeRepo,
                  noteRepo,
                  ulidFactory,
                });
                result.generatedNotes += noteResult.generatedCount;
              } catch (error) {
                logger.warn('[studyAllUsers] ノート生成失敗（スキップして継続）', {
                  userId,
                  characterId,
                  error: toErrorMessage(error),
                });
              }
            }
          }
        } catch (error) {
          logger.warn('[studyAllUsers] キャラクター処理失敗（他キャラは継続）', {
            userId,
            characterId,
            error: toErrorMessage(error),
          });
          hasCharacterError = true;
        }
      }

      // failed 計上が最優先。次に studied/skipped を判定する。
      if (hasCharacterError) {
        result.failedUsers++;
        result.failedUserIds.push(userId);
      } else if (hasStudied) {
        result.studiedUsers++;
      } else {
        result.skippedUsers++;
      }
    } catch (error) {
      logger.error('[studyAllUsers] ユーザー処理失敗', {
        userId,
        error: toErrorMessage(error),
      });
      result.failedUsers++;
      result.failedUserIds.push(userId);
    }
  }

  logger.info('[studyAllUsers] 全ユーザー処理完了', { ...result });
  return result;
}
