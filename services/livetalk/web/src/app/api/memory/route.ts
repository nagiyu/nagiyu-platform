import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { DEFAULT_CHARACTER_ID } from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { getTopicRepository } from '@/lib/server/repositories';
import { sortSelfFacts, toSelfFactListItem } from '@/lib/memory/serializer';
import { hasCharacter } from '@/lib/characters/registry';
import { MEMORY_ERROR_MESSAGES } from './constants';
import type { SelfFactListItem } from '@/lib/memory/types';

/**
 * GET /api/memory
 *
 * 認証ユーザーの SELF fact（私について覚えていること）を一覧で返す
 * （リブトーク知識再設計 P2 / #3698、Tier memory から Topic 中心モデルへ移行）。
 *
 * Query パラメータ：
 * - `characterId`（任意、未指定なら DEFAULT_CHARACTER_ID）。選択中のキャラクター ID。
 *
 * データ源: `listTopicHeaders`（GSI-TOPIC 経由）で Topic を列挙し、各 Topic の
 * `listSelfFacts` を集約して SELF fact 一覧を構築する（GSI-SELF は追加しない、D1）。
 */
export const GET = withAuth(getSession, 'livetalk:chat', async (session, request: Request) => {
  const url = new URL(request.url);
  const characterId = url.searchParams.get('characterId') || DEFAULT_CHARACTER_ID;
  if (!hasCharacter(characterId)) {
    return NextResponse.json(
      { error: 'INVALID_CHARACTER', message: MEMORY_ERROR_MESSAGES.INVALID_CHARACTER },
      { status: 400 }
    );
  }

  const userId = session.user.googleId;
  const topicRepository = getTopicRepository();

  try {
    const topicHeaders = await topicRepository.listTopicHeaders(userId, characterId);

    const perTopicItems = await Promise.all(
      topicHeaders.map(async (topic) => {
        const selfFacts = await topicRepository.listSelfFacts(
          userId,
          characterId,
          topic.TopicID
        );
        return selfFacts.map((fact) => toSelfFactListItem(fact, topic.Subject));
      })
    );

    const collected: SelfFactListItem[] = perTopicItems.flat();
    const selfFacts = sortSelfFacts(collected);
    return NextResponse.json({ selfFacts });
  } catch (error) {
    console.error('[GET /api/memory] SELF fact 一覧の取得に失敗しました', error);
    return NextResponse.json(
      { error: 'FETCH_FAILED', message: MEMORY_ERROR_MESSAGES.FETCH_FAILED },
      { status: 500 }
    );
  }
});
