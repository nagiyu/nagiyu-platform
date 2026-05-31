import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '@/lib/server/session';
import { getMemoryRepository } from '@/lib/server/repositories';
import { decodeMemoryId } from '@/lib/memory/memory-id';
import { toMemoryListItem } from '@/lib/memory/serializer';
import { MEMORY_ERROR_MESSAGES } from '../constants';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/memory/:id
 *
 * 単一の記憶を返す。`:id` は base64url エンコードした完全 SK。
 */
export const GET = withAuth(
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

    try {
      const memory = await getMemoryRepository().get(key);
      if (!memory) {
        return NextResponse.json(
          { error: 'NOT_FOUND', message: MEMORY_ERROR_MESSAGES.NOT_FOUND },
          { status: 404 }
        );
      }
      return NextResponse.json({ memory: toMemoryListItem(memory) });
    } catch (error) {
      console.error('[GET /api/memory/:id] 記憶の取得に失敗しました', error);
      return NextResponse.json(
        { error: 'FETCH_FAILED', message: MEMORY_ERROR_MESSAGES.FETCH_FAILED },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/memory/:id
 *
 * 記憶を物理削除する。削除後は次回チャットの retrieve 対象から外れる。
 */
export const DELETE = withAuth(
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

    try {
      await getMemoryRepository().delete(key);
      return NextResponse.json({ deleted: true });
    } catch (error) {
      console.error('[DELETE /api/memory/:id] 記憶の削除に失敗しました', error);
      return NextResponse.json(
        { error: 'DELETE_FAILED', message: MEMORY_ERROR_MESSAGES.DELETE_FAILED },
        { status: 500 }
      );
    }
  }
);
