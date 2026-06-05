import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '@/lib/server/session';
import { getMemoryRepository } from '@/lib/server/repositories';
import { decodeMemoryId } from '@/lib/memory/memory-id';
import { toMemoryListItem } from '@/lib/memory/serializer';
import { MEMORY_ERROR_MESSAGES } from '../../constants';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/memory/:id/pin
 *
 * 記憶を Tier A に昇格固定（ピン留め）する。既に Tier A の場合は現状を返す。
 * 昇格は SK 変更を伴うため repository の promote（delete + put のトランザクション）に委譲する。
 */
export const POST = withAuth(
  getSession,
  'livetalk:chat',
  async (session, _request: Request, context: RouteContext) => {
    const { id } = await context.params;
    const key = decodeMemoryId(id, session.user.googleId);
    if (!key) {
      return NextResponse.json(
        { error: 'INVALID_ID', message: MEMORY_ERROR_MESSAGES.INVALID_ID },
        { status: 400 }
      );
    }

    const repo = getMemoryRepository();

    try {
      const existing = await repo.get(key);
      if (!existing) {
        return NextResponse.json(
          { error: 'NOT_FOUND', message: MEMORY_ERROR_MESSAGES.NOT_FOUND },
          { status: 404 }
        );
      }

      if (existing.Tier === 'A') {
        return NextResponse.json({ memory: toMemoryListItem(existing) });
      }

      const promoted = await repo.promote(existing, 'A');
      return NextResponse.json({ memory: toMemoryListItem(promoted) });
    } catch (error) {
      console.error('[POST /api/memory/:id/pin] 記憶の固定に失敗しました', error);
      return NextResponse.json(
        { error: 'PIN_FAILED', message: MEMORY_ERROR_MESSAGES.PIN_FAILED },
        { status: 500 }
      );
    }
  }
);
