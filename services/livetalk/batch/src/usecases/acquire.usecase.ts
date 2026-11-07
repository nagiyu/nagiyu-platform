import { logger, toErrorMessage } from '@nagiyu/common';
import {
  getAllCharacterIds,
  getCharacterDefinitionById,
  acquireForUser,
  computePerCharacterResearchLimit,
  createDailyResearchAllowance,
  isStudyPaused,
  resolveLastUserMessageAt,
  type CharacterDefinition,
  type IResearchClient,
  type IWebFactChangeDetector,
  type LifecycleEntity,
  type LifecycleRepository,
  type MessageRepository,
  type ProfileRepository,
  type StudyTopicRepository,
  type StudyUsageRepository,
  type TopicRepository,
  type UlidFactory,
  type WebRawRepository,
} from '@nagiyu/livetalk-core';

export interface AcquireAllUsersParams {
  profileRepo: ProfileRepository;
  lifecycleRepo: LifecycleRepository;
  messageRepo: MessageRepository;
  topicRepo: TopicRepository;
  webRawRepo: WebRawRepository;
  studyTopicRepo: StudyTopicRepository;
  /** 勉強の 1 日あたりの回数 (利用者 × 日) の記録 */
  studyUsageRepo: StudyUsageRepository;
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
  /**
   * 鮮度切れ再取得で実行した research の総回数（トピック単位。変化の有無を問わない）。
   * 期限切れ WEB fact の件数とは一致しない（fact 件数は `staleFactsReviewed` を参照）。
   */
  staleRefreshed: number;
  /** 鮮度切れ再取得のうち変化ありと判定された総回数 */
  staleChanged: number;
  /** 鮮度切れ再取得で NextReview を前方更新した WEB fact の総数 */
  staleFactsReviewed: number;
  /** care 自発リサーチを行った総件数 */
  selfStudied: number;
  /** WEBRAW を書き込んだ総件数 */
  webRawWritten: number;
  /** 1 日の上限に達して勉強を止めた利用者 × キャラクターの組の数 */
  dailyLimitReachedCharacters: number;
  /** 回数の記録に失敗して勉強を止めた利用者 × キャラクターの組の数 */
  counterFailedCharacters: number;
}

/** 勉強中 (lifecycle があり、3 日ルールで止まっていない) のキャラクター */
interface StudyingCharacter {
  characterId: string;
  characterDef: CharacterDefinition;
  lifecycle: LifecycleEntity;
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
    messageRepo,
    topicRepo,
    webRawRepo,
    studyTopicRepo,
    studyUsageRepo,
    researchClient,
    changeDetector,
    ulidFactory,
    now = () => new Date(),
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
    staleFactsReviewed: 0,
    selfStudied: 0,
    webRawWritten: 0,
    dailyLimitReachedCharacters: 0,
    counterFailedCharacters: 0,
  };

  const allCharacterIds = getAllCharacterIds();

  for (const userId of userIds) {
    let hasCharacterError = false;
    let hasAcquired = false;

    try {
      // 勉強中のキャラクターの人数で 1 日の枠を等分するため、先に全キャラクターの
      // lifecycle と停止判定を済ませる。就寝中のキャラクターも枠の配分には含める:
      // 勉強中かどうかは 3 日ルールで決まり、就寝は一日の中で入れ替わる一時的な状態のため、
      // 就寝で人数を数え直すと同じ日の中で枠の大きさが揺れる。
      const studying: StudyingCharacter[] = [];
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

          const checkedAt = now();
          const lastUserMessageAt = await resolveLastUserMessageAt(
            messageRepo,
            userId,
            characterId,
            checkedAt
          );
          if (isStudyPaused(lastUserMessageAt, checkedAt)) continue;

          studying.push({ characterId, characterDef, lifecycle });
        } catch (error) {
          logger.warn('[acquireAllUsers] キャラクター処理失敗（他キャラは継続）', {
            userId,
            characterId,
            error: toErrorMessage(error),
          });
          hasCharacterError = true;
        }
      }

      const limitPerCharacter = computePerCharacterResearchLimit(studying.length);

      for (const { characterId, characterDef, lifecycle } of studying) {
        try {
          const outcome = await acquireForUser(userId, characterId, {
            topicRepo,
            webRawRepo,
            studyTopicRepo,
            researchClient,
            changeDetector,
            character: characterDef,
            lifecycle,
            researchAllowance: createDailyResearchAllowance({
              studyUsageRepo,
              userId,
              characterId,
              limit: limitPerCharacter,
              now,
            }),
            ulidFactory,
            now,
          });

          if (outcome.dailyLimitReached) result.dailyLimitReachedCharacters++;
          if (outcome.counterFailed) {
            result.counterFailedCharacters++;
            // 勉強が黙って止まらないよう、バッチの失敗として上げる
            hasCharacterError = true;
          }

          if (outcome.outcome === 'acquired') {
            hasAcquired = true;
            result.requestsProcessed += outcome.requestsProcessed;
            result.staleRefreshed += outcome.staleRefreshed;
            result.staleChanged += outcome.staleChanged;
            result.staleFactsReviewed += outcome.staleFactsReviewed;
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
