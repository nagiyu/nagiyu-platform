/**
 * GET /api/push/first-word — 指定キャラクターの未消化の最新通知を返す。
 *
 * クエリパラメータ:
 *   - characterId: 取得対象のキャラクター ID。
 *     指定時: そのキャラクターの未消化最新 NotificationEvent を返す。
 *     未指定時: キャラクター概念がないため 204 を返す（呼び出し側は必ず characterId を付与する設計）。
 *
 * レスポンスに characterId を含めることで、page 側でクロス汚染ガードを行える。
 * suggestedReply は通知タップ起動時に入力欄へプリフィルするユーザー発話。null の場合はプリフィルしない。
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '@/lib/server/session';
import { getNotificationEventRepository } from '@/lib/server/repositories';

export const GET = withAuth(getSession, 'livetalk:chat', async (session, request: Request) => {
  const url = new URL(request.url);
  const characterId = url.searchParams.get('characterId');

  // characterId 未指定時は 204 を返す（呼び出し側は必ず characterId を付与する設計）
  if (!characterId) {
    return new NextResponse(null, { status: 204 });
  }

  const userId = session.user.googleId;
  const repo = getNotificationEventRepository();
  const events = await repo.listByUser(userId, 20);

  // 指定キャラクターの未消化最新を返す
  const unconsumed = events.find(
    (e) => e.CharacterID === characterId && e.ConsumedAt === undefined
  );
  if (!unconsumed) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(
    {
      notifId: unconsumed.NotifID,
      body: unconsumed.Body,
      knowledgeId: unconsumed.KnowledgeID ?? null,
      characterId: unconsumed.CharacterID,
      suggestedReply: unconsumed.SuggestedReply ?? null,
    },
    { status: 200 }
  );
});
