import { logger, toErrorMessage } from '@nagiyu/common';
import {
  getAllCharacterIds,
  getCharacterDefinitionById,
  consolidate,
  generateNotesForUser,
  type ConsolidateParams,
  type NoteRepository,
  type ProfileRepository,
} from '@nagiyu/livetalk-core';

export type ConsolidateAllConversationsParams = Omit<ConsolidateParams, 'characterName'> & {
  profileRepo: ProfileRepository;
  /** ノート生成（リブトーク知識・記憶再設計 P4）に使う Note リポジトリ。 */
  noteRepo: NoteRepository;
};

export interface ConsolidateAllConversationsResult {
  processedUsers: number;
  skippedUsers: number;
  failedUsers: number;
  failedUserIds: string[];
  /** 生成されたノートの総数（リブトーク知識・記憶再設計 P4） */
  generatedNotes: number;
}

/**
 * 全アクティブユーザーの全キャラクターについて、未集約データ（Message / WebRaw）を
 * Topic 中心モデルへ集約する（リブトーク知識再設計 P1 / #3697）。
 *
 * ProfileRepository（GSI1）でユーザーを列挙し、各ユーザーについて全キャラクターの
 * 未集約データを集約する。キャラクターごとに処理し、あるキャラクターで失敗しても
 * 他キャラクターの処理を継続する（`compressAllConversations` と同じ fail-warn 方針）。
 *
 * 集約（Topic 更新）が実行された直後は「贈り時」のため、後段でノート生成
 * （`generateNotesForUser`）を呼ぶ（リブトーク知識・記憶再設計 P4「ノート（ギフト化）」）。
 * ノート生成の失敗は集約バッチ全体を止めない fail-warn とする（他キャラは継続）。
 */
export async function consolidateAllConversations(
  params: ConsolidateAllConversationsParams
): Promise<ConsolidateAllConversationsResult> {
  const {
    profileRepo,
    topicRepo,
    messageRepo,
    webRawRepo,
    cursorRepo,
    llmClient,
    embeddingClient,
    noteRepo,
    now,
    ulidFactory,
  } = params;

  const userIds = await profileRepo.listAllUserIds();

  logger.info('[consolidateAllConversations] ユーザー一覧取得完了', {
    userCount: userIds.length,
  });

  const result: ConsolidateAllConversationsResult = {
    processedUsers: 0,
    skippedUsers: 0,
    failedUsers: 0,
    failedUserIds: [],
    generatedNotes: 0,
  };

  const allCharacterIds = getAllCharacterIds();

  for (const userId of userIds) {
    let hasCharacterError = false;
    let hasConsolidated = false;

    try {
      for (const characterId of allCharacterIds) {
        const characterDef = getCharacterDefinitionById(characterId);
        if (!characterDef) {
          logger.warn(
            '[consolidateAllConversations] キャラクター定義が見つかりません（スキップ）',
            { characterId }
          );
          continue;
        }

        try {
          const outcome = await consolidate(userId, characterId, {
            topicRepo,
            messageRepo,
            webRawRepo,
            cursorRepo,
            llmClient,
            embeddingClient,
            characterName: characterDef.displayName,
            now,
            ulidFactory,
          });
          if (outcome === 'consolidated') {
            hasConsolidated = true;

            // Topic が更新された直後は「贈り時」。ノート生成の失敗はここでは
            // 集約バッチ全体を止めない fail-warn とし、他キャラの処理を継続する
            // （リブトーク知識・記憶再設計 P4「ノート（ギフト化）」）。
            try {
              const noteResult = await generateNotesForUser(userId, characterId, {
                topicRepo,
                noteRepo,
                llmClient,
                characterName: characterDef.displayName,
                now,
                ulidFactory,
              });
              result.generatedNotes += noteResult.generatedCount;
            } catch (error) {
              logger.warn('[consolidateAllConversations] ノート生成失敗（スキップして継続）', {
                userId,
                characterId,
                error: toErrorMessage(error),
              });
            }
          }
        } catch (error) {
          logger.warn('[consolidateAllConversations] キャラクター処理失敗（他キャラは継続）', {
            userId,
            characterId,
            error: toErrorMessage(error),
          });
          hasCharacterError = true;
        }
      }

      // failed 計上が最優先。次に consolidated/skipped を判定する。
      if (hasCharacterError) {
        result.failedUsers++;
        result.failedUserIds.push(userId);
      } else if (hasConsolidated) {
        result.processedUsers++;
      } else {
        result.skippedUsers++;
      }
    } catch (error) {
      logger.error('[consolidateAllConversations] ユーザー処理失敗', {
        userId,
        error: toErrorMessage(error),
      });
      result.failedUsers++;
      result.failedUserIds.push(userId);
    }
  }

  logger.info('[consolidateAllConversations] 全ユーザー処理完了', { ...result });
  return result;
}
