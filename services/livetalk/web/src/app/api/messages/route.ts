import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { DEFAULT_CHARACTER_ID } from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { getMessageRepository } from '@/lib/server/repositories';
import {
  MESSAGES_ERROR_MESSAGES,
  MESSAGES_MAX_TOKEN_LIMIT,
  MESSAGES_MIN_TOKEN_LIMIT,
} from './constants';

/**
 * GET /api/messages
 *
 * 認証ユーザーの直近メッセージを「トークン上限ベース」で返す。
 *
 * Query パラメータ：
 * - `characterId`（任意、既定 `hiyori`）
 * - `tokenLimit`（任意、未指定なら `LLM_CONTEXT_TOKEN_LIMIT` env または 40K）
 *
 * Phase 2a では Phase 2c の `/api/chat` 統合までの中継 API。LLM プロンプト用に
 * 時系列昇順で返すため、UI 側で「最新メッセージ N 件」UI を作る場合は反転する想定。
 */
export const GET = withAuth(getSession, 'livetalk:chat', async (session, request: Request) => {
  const url = new URL(request.url);
  const characterId = url.searchParams.get('characterId') || DEFAULT_CHARACTER_ID;

  let tokenLimit: number | undefined;
  const rawTokenLimit = url.searchParams.get('tokenLimit');
  if (rawTokenLimit !== null) {
    const parsed = Number.parseInt(rawTokenLimit, 10);
    if (
      !Number.isFinite(parsed) ||
      parsed < MESSAGES_MIN_TOKEN_LIMIT ||
      parsed > MESSAGES_MAX_TOKEN_LIMIT
    ) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: MESSAGES_ERROR_MESSAGES.INVALID_REQUEST },
        { status: 400 }
      );
    }
    tokenLimit = parsed;
  }

  try {
    const result = await getMessageRepository().getRecentByTokenBudget({
      userId: session.user.googleId,
      characterId,
      tokenLimit,
    });
    return NextResponse.json({
      messages: result.messages.map((m) => ({
        messageId: m.MessageID,
        characterId: m.CharacterID,
        role: m.Role,
        text: m.Text,
        createdAt: m.CreatedAt,
      })),
      totalTokens: result.totalTokens,
      truncated: result.truncated,
    });
  } catch (error) {
    console.error('[GET /api/messages] メッセージ取得に失敗しました', error);
    return NextResponse.json(
      { error: 'FETCH_FAILED', message: MESSAGES_ERROR_MESSAGES.FETCH_FAILED },
      { status: 500 }
    );
  }
});
