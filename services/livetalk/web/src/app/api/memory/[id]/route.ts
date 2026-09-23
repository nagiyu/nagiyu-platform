import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { forgetSelfFact } from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { getTopicRepository } from '@/lib/server/repositories';
import { getLLMClient } from '@/lib/server/llm';
import { decodeSelfFactId } from '@/lib/memory/memory-id';
import { MEMORY_ERROR_MESSAGES } from '../constants';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/memory/:id
 *
 * SELF fact を決定的に忘却する（リブトーク知識再設計 P2 / #3698、design §4.3）。
 * `:id` は base64url エンコードした完全 SK。`forgetSelfFact` が
 * 削除 → 残 fact からの canonicalSummary 再生成（楽観ロック + リトライ）までを行う。
 */
export const DELETE = withAuth(
  getSession,
  'livetalk:chat',
  async (session, _request: Request, context: RouteContext) => {
    const { id } = await context.params;
    const key = decodeSelfFactId(id, session.user.googleId);
    if (!key) {
      return NextResponse.json(
        { error: 'INVALID_ID', message: MEMORY_ERROR_MESSAGES.INVALID_ID },
        { status: 400 }
      );
    }

    try {
      await forgetSelfFact(key, {
        topicRepository: getTopicRepository(),
        llmClient: getLLMClient(),
      });
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
