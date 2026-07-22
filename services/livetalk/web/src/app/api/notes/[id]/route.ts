import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import type { TopicBundle } from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { getNoteRepository, getTopicRepository } from '@/lib/server/repositories';
import { decodeNoteId } from '@/lib/notes/note-id';
import { toNoteDetail } from '@/lib/notes/serializer';
import { NOTE_ERROR_MESSAGES } from '../constants';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/notes/:id
 *
 * 単一ノートを詳細付きで返す。`:id` は base64url エンコードした完全 SK。
 *
 * 中身（webFacts/sources）は参照先 Topic の最新状態を都度反映する
 * （リブトーク知識・記憶再設計 P4「ノート（ギフト化）」）。Topic の取得に失敗しても
 * headline（贈った瞬間の不変記録）は返す（fail-soft）。
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

      let bundle: TopicBundle | null = null;
      try {
        bundle = await getTopicRepository().getTopicBundle({
          userId: key.userId,
          characterId: key.characterId,
          topicId: note.TopicID,
        });
      } catch (error) {
        // fail-soft: Topic 取得に失敗しても headline のみで詳細を返す
        console.error(
          '[GET /api/notes/:id] 参照先 Topic の取得に失敗しました（headline のみ返します）',
          error
        );
      }

      return NextResponse.json({ note: toNoteDetail(note, bundle) });
    } catch (error) {
      console.error('[GET /api/notes/:id] ノートの取得に失敗しました', error);
      return NextResponse.json(
        { error: 'FETCH_FAILED', message: NOTE_ERROR_MESSAGES.FETCH_FAILED },
        { status: 500 }
      );
    }
  }
);
