/**
 * GET /api/push/pending — 未消化通知をキャラクターごとに集約して返す。
 *
 * 自前起動時に「他キャラクターからの未消化通知」を提示するために使用する。
 * 各キャラクターの最新未消化通知（1 件）を返す。
 *
 * キャラごとの最新未消化をページングで集約するため、消化済み通知が多い場合でも
 * 未消化通知を取りこぼさない。
 *
 * レスポンス例:
 *   [{ characterId: 'ageha', notifId: 'n1', body: 'アゲハより' }]
 *
 * 未消化通知がない場合は空配列を返す。
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { getAllCharacterIds } from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { getNotificationEventRepository } from '@/lib/server/repositories';

/**
 * 未消化通知の集約結果の型。
 */
export interface PendingNotification {
  /** 通知元キャラクター ID */
  characterId: string;
  /** 通知 ID */
  notifId: string;
  /** 通知本文 */
  body: string;
}

export const GET = withAuth(getSession, 'livetalk:chat', async (session) => {
  const userId = session.user.googleId;
  const repo = getNotificationEventRepository();
  const characterIds = getAllCharacterIds();

  const events = await repo.listLatestUnconsumedByCharacter(userId, characterIds);

  const result: PendingNotification[] = events.map((e) => ({
    characterId: e.CharacterID,
    notifId: e.NotifID,
    body: e.Body,
  }));

  return NextResponse.json(result, { status: 200 });
});
