import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '@/lib/server/session';
import { getNoteRepository } from '@/lib/server/repositories';
import { decodeNoteId } from '@/lib/notes/note-id';
import { toNoteDetail } from '@/lib/notes/serializer';
import { NOTE_ERROR_MESSAGES } from '../constants';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/notes/:id
 *
 * 単一ノートを本文付きで返す。`:id` は base64url エンコードした完全 SK。
 */
export const GET = withAuth(
  getSession,
  'livetalk:chat',
  async (session, _request: Request, context: RouteContext) => {
    const { id } = await context.params;
    const key = decodeNoteId(id, session.user.googleId);
    if (!key) {
      return NextResponse.json(
        { error: 'INVALID_ID', message: NOTE_ERROR_MESSAGES.INVALID_ID },
        { status: 400 }
      );
    }

    try {
      const note = await getNoteRepository().get(key);
      if (!note) {
        return NextResponse.json(
          { error: 'NOT_FOUND', message: NOTE_ERROR_MESSAGES.NOT_FOUND },
          { status: 404 }
        );
      }
      return NextResponse.json({ note: toNoteDetail(note) });
    } catch (error) {
      console.error('[GET /api/notes/:id] ノートの取得に失敗しました', error);
      return NextResponse.json(
        { error: 'FETCH_FAILED', message: NOTE_ERROR_MESSAGES.FETCH_FAILED },
        { status: 500 }
      );
    }
  }
);
