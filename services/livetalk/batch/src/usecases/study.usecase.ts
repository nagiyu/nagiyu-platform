import { logger, toErrorMessage } from '@nagiyu/common';
import {
  getAllCharacterIds,
  getCharacterDefinitionById,
  studyForUser,
  type InterestRepository,
  type KnowledgeRepository,
  type LifecycleRepository,
  type ProfileRepository,
  type UlidFactory,
} from '@nagiyu/livetalk-core';
import type { IResearchClient } from '@nagiyu/livetalk-core';

export interface StudyAllUsersParams {
  profileRepo: ProfileRepository;
  lifecycleRepo: LifecycleRepository;
  interestRepo: InterestRepository;
  knowledgeRepo: KnowledgeRepository;
  researchClient: IResearchClient;
  ulidFactory?: UlidFactory;
  now?: () => Date;
}

export interface StudyAllUsersResult {
  studiedUsers: number;
  skippedUsers: number;
  failedUsers: number;
  failedUserIds: string[];
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
