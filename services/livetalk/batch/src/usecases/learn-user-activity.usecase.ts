import { logger, toErrorMessage } from '@nagiyu/common';
import {
  getAllCharacterIds,
  getCharacterDefinitionById,
  learnUserActivity,
  type LifecycleRepository,
  type MessageRepository,
  type ProfileRepository,
} from '@nagiyu/livetalk-core';

export interface LearnAllUserActivitiesParams {
  profileRepo: ProfileRepository;
  messageRepo: MessageRepository;
  lifecycleRepo: LifecycleRepository;
  /** 学習基準日時（省略時は実行時刻）。テスト用差し替え可。 */
  now?: () => Date;
}

export interface LearnAllUserActivitiesResult {
  processedUsers: number;
  skippedUsers: number;
  failedUsers: number;
  failedUserIds: string[];
}

/**
 * 全アクティブユーザーの活動時間を学習する。
 *
 * ProfileRepository（GSI1）でユーザーを列挙し、
 * 各ユーザーについて全キャラクターの発話履歴を学習する。
 * あるキャラクターで失敗しても他キャラクターの処理は継続する。
 */
export async function learnAllUserActivities(
  params: LearnAllUserActivitiesParams
): Promise<LearnAllUserActivitiesResult> {
  const { profileRepo, messageRepo, lifecycleRepo, now } = params;

  const userIds = await profileRepo.listAllUserIds();

  logger.info('[learnAllUserActivities] ユーザー一覧取得完了', {
    userCount: userIds.length,
  });

  const result: LearnAllUserActivitiesResult = {
    processedUsers: 0,
    skippedUsers: 0,
    failedUsers: 0,
    failedUserIds: [],
  };

  const allCharacterIds = getAllCharacterIds();

  for (const userId of userIds) {
    let hasCharacterError = false;
    let hasLearned = false;

    try {
      for (const characterId of allCharacterIds) {
        const characterDef = getCharacterDefinitionById(characterId);
        if (!characterDef) {
          logger.warn('[learnAllUserActivities] キャラクター定義が見つかりません（スキップ）', {
            characterId,
          });
          continue;
        }

        try {
          const outcome = await learnUserActivity(userId, characterId, {
            messageRepo,
            lifecycleRepo,
            ...(now !== undefined && { now }),
          });
          if (outcome === 'learned') {
            hasLearned = true;
          }
        } catch (error) {
          logger.warn('[learnAllUserActivities] キャラクター処理失敗（他キャラは継続）', {
            userId,
            characterId,
            error: toErrorMessage(error),
          });
          hasCharacterError = true;
        }
      }

      // failed 計上が最優先。次に learned/skipped を判定する。
      if (hasCharacterError) {
        result.failedUsers++;
        result.failedUserIds.push(userId);
      } else if (hasLearned) {
        result.processedUsers++;
      } else {
        result.skippedUsers++;
      }
    } catch (error) {
      logger.error('[learnAllUserActivities] ユーザー処理失敗', {
        userId,
        error: toErrorMessage(error),
      });
      result.failedUsers++;
      result.failedUserIds.push(userId);
    }
  }

  logger.info('[learnAllUserActivities] 全ユーザー処理完了', { ...result });
  return result;
}
