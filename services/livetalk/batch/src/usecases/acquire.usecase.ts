import { logger, toErrorMessage } from '@nagiyu/common';
import {
  getAllCharacterIds,
  getCharacterDefinitionById,
  acquireForUser,
  type IResearchClient,
  type IWebFactChangeDetector,
  type LifecycleRepository,
  type ProfileRepository,
  type StudyTopicRepository,
  type TopicRepository,
  type UlidFactory,
  type WebRawRepository,
} from '@nagiyu/livetalk-core';

export interface AcquireAllUsersParams {
  profileRepo: ProfileRepository;
  lifecycleRepo: LifecycleRepository;
  topicRepo: TopicRepository;
  webRawRepo: WebRawRepository;
  studyTopicRepo: StudyTopicRepository;
  researchClient: IResearchClient;
  changeDetector: IWebFactChangeDetector;
  ulidFactory?: UlidFactory;
  now?: () => Date;
}

export interface AcquireAllUsersResult {
  processedUsers: number;
  skippedUsers: number;
  failedUsers: number;
  failedUserIds: string[];
  /** 依頼（StudyTopic pending）を処理した総件数 */
  requestsProcessed: number;
  /** 鮮度切れ WEB fact を再取得した総件数 */
  staleRefreshed: number;
  /** 鮮度切れ再取得のうち変化ありと判定された総件数 */
  staleChanged: number;
  /** care 自発リサーチを行った総件数 */
  selfStudied: number;
  /** WEBRAW を書き込んだ総件数 */
  webRawWritten: number;
}

/**
 * 全アクティブユーザーの全キャラクターについて acquire（Web「取得だけ」）を実行する
 * （リブトーク知識再設計 P3 / #3699）。
 *
 * ProfileRepository（GSI1）でユーザーを列挙し、各ユーザーについて全キャラクターを走査し、
 * lifecycle 未登録キャラはスキップする。あるキャラクターで失敗しても他キャラクターの
 * 処理は継続する（`studyAllUsers` / `consolidateAllConversations` と同じ fail-warn 方針）。
 */
export async function acquireAllUsers(
  params: AcquireAllUsersParams
): Promise<AcquireAllUsersResult> {
  const {
    profileRepo,
    lifecycleRepo,
    topicRepo,
    webRawRepo,
    studyTopicRepo,
    researchClient,
    changeDetector,
    ulidFactory,
    now,
  } = params;

  const userIds = await profileRepo.listAllUserIds();

  logger.info('[acquireAllUsers] ユーザー一覧取得完了', { userCount: userIds.length });

  const result: AcquireAllUsersResult = {
    processedUsers: 0,
    skippedUsers: 0,
    failedUsers: 0,
    failedUserIds: [],
    requestsProcessed: 0,
    staleRefreshed: 0,
    staleChanged: 0,
    selfStudied: 0,
    webRawWritten: 0,
  };

  const allCharacterIds = getAllCharacterIds();

  for (const userId of userIds) {
    let hasCharacterError = false;
    let hasAcquired = false;

    try {
      for (const characterId of allCharacterIds) {
        const characterDef = getCharacterDefinitionById(characterId);
        if (!characterDef) {
          logger.warn('[acquireAllUsers] キャラクター定義が見つかりません（スキップ）', {
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

          const outcome = await acquireForUser(userId, characterId, {
            topicRepo,
            webRawRepo,
            studyTopicRepo,
            researchClient,
            changeDetector,
            character: characterDef,
            lifecycle,
            ulidFactory,
            now,
          });

          if (outcome.outcome === 'acquired') {
            hasAcquired = true;
            result.requestsProcessed += outcome.requestsProcessed;
            result.staleRefreshed += outcome.staleRefreshed;
            result.staleChanged += outcome.staleChanged;
            result.selfStudied += outcome.selfStudied;
            result.webRawWritten += outcome.webRawWritten;
          }
        } catch (error) {
          logger.warn('[acquireAllUsers] キャラクター処理失敗（他キャラは継続）', {
            userId,
            characterId,
            error: toErrorMessage(error),
          });
          hasCharacterError = true;
        }
      }

      // failed 計上が最優先。次に processed/skipped を判定する。
      if (hasCharacterError) {
        result.failedUsers++;
        result.failedUserIds.push(userId);
      } else if (hasAcquired) {
        result.processedUsers++;
      } else {
        result.skippedUsers++;
      }
    } catch (error) {
      logger.error('[acquireAllUsers] ユーザー処理失敗', {
        userId,
        error: toErrorMessage(error),
      });
      result.failedUsers++;
      result.failedUserIds.push(userId);
    }
  }

  logger.info('[acquireAllUsers] 全ユーザー処理完了', { ...result });
  return result;
}
