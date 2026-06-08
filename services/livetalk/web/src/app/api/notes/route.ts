import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { DEFAULT_CHARACTER_ID } from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { getNoteRepository } from '@/lib/server/repositories';
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
export const GET = withAuth(getSession, 'livetalk:chat', async (session, request: Request) => {
  const url = new URL(request.url);
  const characterId = url.searchParams.get('characterId') || DEFAULT_CHARACTER_ID;
  if (!hasCharacter(characterId)) {
    return NextResponse.json(
      { error: 'INVALID_CHARACTER', message: NOTE_ERROR_MESSAGES.INVALID_CHARACTER },
      { status: 400 }
    );
  }

  const userId = session.user.googleId;
  const repo = getNoteRepository();

  try {
    const items = await repo.list(userId, characterId);
    const notes = sortNotes(items.map(toNoteListItem));
    return NextResponse.json({ notes });
  } catch (error) {
    console.error('[GET /api/notes] ノート一覧の取得に失敗しました', error);
    return NextResponse.json(
      { error: 'FETCH_FAILED', message: NOTE_ERROR_MESSAGES.FETCH_FAILED },
      { status: 500 }
    );
  }
});
