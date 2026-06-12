import { logger, toErrorMessage } from '@nagiyu/common';
import {
  getAllCharacterIds,
  getCharacterDefinitionById,
  compressConversation,
  type CompressConversationParams,
  type ProfileRepository,
} from '@nagiyu/livetalk-core';

export type CompressAllConversationsParams = Omit<CompressConversationParams, 'characterName'> & {
  profileRepo: ProfileRepository;
};

export interface CompressAllConversationsResult {
  processedUsers: number;
  skippedUsers: number;
  failedUsers: number;
  failedUserIds: string[];
}

/**
 * 全アクティブユーザーの全キャラクター会話を圧縮要約する。
 *
 * ProfileRepository（GSI1）でユーザーを列挙し、
 * 各ユーザーについて全キャラクターの会話を圧縮する。
 * キャラクターごとに処理し、あるキャラクターで失敗しても他キャラクターの処理を継続する。
 */
export async function compressAllConversations(
  params: CompressAllConversationsParams
): Promise<CompressAllConversationsResult> {
  const {
    profileRepo,
    llmClient,
    summaryRepo,
    messageRepo,
    memoryRepo,
    now,
    interestRepo,
    characterStateRepo,
    embeddingClient,
  } = params;

  const userIds = await profileRepo.listAllUserIds();

  logger.info('[compressAllConversations] ユーザー一覧取得完了', {
    userCount: userIds.length,
  });

  const result: CompressAllConversationsResult = {
    processedUsers: 0,
    skippedUsers: 0,
    failedUsers: 0,
    failedUserIds: [],
  };

  const allCharacterIds = getAllCharacterIds();

  for (const userId of userIds) {
    let hasCharacterError = false;
    let hasCompressed = false;

    try {
      for (const characterId of allCharacterIds) {
        const characterDef = getCharacterDefinitionById(characterId);
        if (!characterDef) {
          logger.warn('[compressAllConversations] キャラクター定義が見つかりません（スキップ）', {
            characterId,
          });
          continue;
        }

        try {
          const outcome = await compressConversation(userId, characterId, {
            summaryRepo,
            messageRepo,
            memoryRepo,
            llmClient,
            characterName: characterDef.displayName,
            now,
            interestRepo,
            characterStateRepo,
            embeddingClient,
          });
          if (outcome === 'compressed') {
            hasCompressed = true;
          }
        } catch (error) {
          logger.warn('[compressAllConversations] キャラクター処理失敗（他キャラは継続）', {
            userId,
            characterId,
            error: toErrorMessage(error),
          });
          hasCharacterError = true;
        }
      }

      // failed 計上が最優先。次に compressed/skipped を判定する。
      if (hasCharacterError) {
        result.failedUsers++;
        result.failedUserIds.push(userId);
      } else if (hasCompressed) {
        result.processedUsers++;
      } else {
        result.skippedUsers++;
      }
    } catch (error) {
      logger.error('[compressAllConversations] ユーザー処理失敗', {
        userId,
        error: toErrorMessage(error),
      });
      result.failedUsers++;
      result.failedUserIds.push(userId);
    }
  }

  logger.info('[compressAllConversations] 全ユーザー処理完了', { ...result });
  return result;
}
