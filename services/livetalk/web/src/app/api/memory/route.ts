import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { DEFAULT_CHARACTER_ID, type MemoryEntity } from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { getMemoryRepository } from '@/lib/server/repositories';
import { parseTierQuery, VISIBLE_TIERS } from '@/lib/memory/validation';
import { sortMemories, toMemoryListItem } from '@/lib/memory/serializer';
import { MEMORY_ERROR_MESSAGES } from './constants';

/**
 * GET /api/memory
 *
 * 認証ユーザーの記憶を一覧で返す。
 *
 * Query パラメータ：
 * - `tier`（任意、`A` / `B` / `C` / `D`）。未指定なら UI 表示対象の Tier A/B/C を横断取得。
 *
 * Tier D は一時的なため UI からは指定されない想定だが、明示指定された場合は返す。
 */
export const GET = withAuth(getSession, 'livetalk:chat', async (session, request: Request) => {
  const url = new URL(request.url);
  const parsed = parseTierQuery(url.searchParams.get('tier'));
  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'INVALID_TIER', message: MEMORY_ERROR_MESSAGES.INVALID_TIER },
      { status: 400 }
    );
  }

  const userId = session.user.googleId;
  const characterId = DEFAULT_CHARACTER_ID;
  const repo = getMemoryRepository();

  try {
    const tiers = parsed.tier ? [parsed.tier] : VISIBLE_TIERS;
    const collected: MemoryEntity[] = [];
    for (const tier of tiers) {
      const items = await repo.listByTier(userId, characterId, tier);
      collected.push(...items);
    }

    const memories = sortMemories(collected.map(toMemoryListItem));
    return NextResponse.json({ memories });
  } catch (error) {
    console.error('[GET /api/memory] 記憶一覧の取得に失敗しました', error);
    return NextResponse.json(
      { error: 'FETCH_FAILED', message: MEMORY_ERROR_MESSAGES.FETCH_FAILED },
      { status: 500 }
    );
  }
});
