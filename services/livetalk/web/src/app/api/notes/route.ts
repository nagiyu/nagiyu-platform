import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { DEFAULT_CHARACTER_ID, createNoteRepository } from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { withApiErrorReporting } from '@/lib/server/api-error-reporting';
import { sortNotes, toNoteListItem } from '@/lib/notes/serializer';
import { hasCharacter } from '@/lib/characters/registry';
import { NOTE_ERROR_MESSAGES } from './constants';

/**
 * GET /api/notes
 *
 * 認証ユーザーのノートを一覧で返す（本文なし、作成日時の新しい順）。
 * ノートは閲覧専用のため POST/PATCH/DELETE は提供しない。
 *
 * Query パラメータ：
 * - `characterId`（任意、未指定なら DEFAULT_CHARACTER_ID）。選択中のキャラクター ID。
 */
export const GET = withApiErrorReporting(
  'Web API: ノート一覧取得エラー',
  withAuth(getSession, 'livetalk:chat', async (session, request: Request) => {
    const url = new URL(request.url);
    const characterId = url.searchParams.get('characterId') || DEFAULT_CHARACTER_ID;
    if (!hasCharacter(characterId)) {
      return NextResponse.json(
        { error: 'INVALID_CHARACTER', message: NOTE_ERROR_MESSAGES.INVALID_CHARACTER },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    const repo = createNoteRepository();

    const items = await repo.listAll(userId, characterId);
    const notes = sortNotes(items.map(toNoteListItem));
    return NextResponse.json({ notes });
  }),
  { error: 'FETCH_FAILED', message: NOTE_ERROR_MESSAGES.FETCH_FAILED }
);
