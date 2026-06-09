/**
 * GET /api/push/pending — 未消化通知をキャラクターごとに集約して返す。
 *
 * 自前起動時に「他キャラクターからの未消化通知」を提示するために使用する。
 * 各キャラクターの最新未消化通知（1 件）を返す。
 *
 * レスポンス例:
 *   [{ characterId: 'ageha', notifId: 'n1', body: 'アゲハより' }]
 *
 * 未消化通知がない場合は空配列を返す。
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
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
  // 全件取得して未消化をキャラクターごとに集約する
  // listByUser は CreatedAt 降順で返すため、最初に見つかったものが最新となる
  const events = await repo.listByUser(userId, 100);

  // 未消化イベントのみ抽出し、キャラクターごとに最新 1 件を集約する
  const latestByCharacter = new Map<string, PendingNotification>();
  for (const e of events) {
    if (e.ConsumedAt !== undefined) continue;
    // すでに同キャラクターのエントリがあればスキップ（降順なので最初が最新）
    if (latestByCharacter.has(e.CharacterID)) continue;
    latestByCharacter.set(e.CharacterID, {
      characterId: e.CharacterID,
      notifId: e.NotifID,
      body: e.Body,
    });
  }

  const result: PendingNotification[] = Array.from(latestByCharacter.values());
  return NextResponse.json(result, { status: 200 });
});
