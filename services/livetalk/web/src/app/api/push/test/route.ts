/**
 * POST /api/push/test
 *
 * livetalk:admin 権限保持者向けの「テスト通知送信」API（Issue #3491）。
 *
 * dev 環境での通知結合検証用：
 *   - 任意のキャラクターへの通知を decision ゲートを一切介さずに即時送信できる。
 *   - 「両キャラから通知が届く／タップで各キャラが開く／第一声が出る」の検証に使用する。
 *
 * このエンドポイントは恒久的な admin デバッグツールとして維持する。
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { logger, toErrorMessage } from '@nagiyu/common';
import { sendWebPushNotification, getVapidConfig } from '@nagiyu/common/push';
import { defaultUlidFactory, NOTIFICATION_EVENT_TTL_SECONDS } from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import {
  getPushSubscriptionRepository,
  getNotificationEventRepository,
} from '@/lib/server/repositories';
import { hasCharacter, getCharacterDefinition } from '@/lib/characters/registry';

/**
 * このエンドポイント固有のエラーメッセージ定数。
 *
 * Next.js の Route ファイルは HTTP メソッド等の規定エクスポートしか許可しないため、
 * この定数は export せずローカルに閉じる（export すると build の型検査で弾かれる）。
 */
const TEST_PUSH_ERROR_MESSAGES = {
  INVALID_REQUEST_BODY: 'リクエストボディが不正です',
  MISSING_CHARACTER_ID: 'characterId が必要です',
  UNKNOWN_CHARACTER: '指定されたキャラクターが見つかりません',
  SEND_FAILED: 'テスト通知の送信に失敗しました',
} as const;

export const POST = withAuth(getSession, 'livetalk:admin', async (session, request: Request) => {
  const userId = session.user.googleId;

  // リクエストボディを解析する
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: TEST_PUSH_ERROR_MESSAGES.INVALID_REQUEST_BODY },
      { status: 400 }
    );
  }

  // characterId バリデーション
  if (!body || typeof body !== 'object' || !('characterId' in body)) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: TEST_PUSH_ERROR_MESSAGES.MISSING_CHARACTER_ID },
      { status: 400 }
    );
  }

  const { characterId } = body as { characterId: unknown };

  if (typeof characterId !== 'string' || characterId.trim() === '') {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: TEST_PUSH_ERROR_MESSAGES.MISSING_CHARACTER_ID },
      { status: 400 }
    );
  }

  if (!hasCharacter(characterId)) {
    return NextResponse.json(
      { error: 'UNKNOWN_CHARACTER', message: TEST_PUSH_ERROR_MESSAGES.UNKNOWN_CHARACTER },
      { status: 400 }
    );
  }

  try {
    // キャラクター定義からテスト通知の文面を生成する（テストと明確に分かる内容にする）
    const def = getCharacterDefinition(characterId);
    const title = `${def.notificationName}より`;
    const bodyText = `【テスト送信】${def.displayName}からのテスト通知です`;

    // プッシュサブスクリプションを取得する
    const subscriptions = await getPushSubscriptionRepository().listByUser(userId);

    // サブスクリプションが 0 件の場合は送信せずに返す
    if (subscriptions.length === 0) {
      logger.info('[POST /api/push/test] 購読なし（送信スキップ）', { userId, characterId });
      return NextResponse.json({ sent: 0, characterId }, { status: 200 });
    }

    // VAPID 設定を取得する
    const vapidConfig = getVapidConfig();

    // payload: notify.usecase.ts と同様の形式
    const payload = {
      title,
      body: bodyText,
      data: { url: `/?character=${characterId}`, characterId },
    };

    // 各サブスクリプションへ送信する（失敗はログのみで継続・無効サブスクは削除）
    const pushSubscriptionRepo = getPushSubscriptionRepository();
    let sentCount = 0;

    for (const sub of subscriptions) {
      try {
        const sent = await sendWebPushNotification(
          { endpoint: sub.Endpoint, keys: { p256dh: sub.P256dhKey, auth: sub.AuthKey } },
          payload,
          vapidConfig
        );
        if (sent) {
          sentCount++;
        } else {
          // 無効なサブスクリプション（404/410）を削除する
          await pushSubscriptionRepo.delete({
            userId,
            subscriptionId: sub.SubscriptionID,
          });
        }
      } catch (error) {
        logger.warn('[POST /api/push/test] Push 送信失敗（継続）', {
          userId,
          characterId,
          subscriptionId: sub.SubscriptionID,
          error: toErrorMessage(error),
        });
      }
    }

    // 1 件以上送信成功した場合、NotificationEvent を記録する（first-word/pending 検証のため）
    if (sentCount > 0) {
      const ttl = Math.floor(Date.now() / 1000) + NOTIFICATION_EVENT_TTL_SECONDS;
      await getNotificationEventRepository().put({
        UserID: userId,
        NotifID: defaultUlidFactory(),
        CharacterID: characterId,
        Kind: 'normal',
        Title: title,
        Body: bodyText,
        Ttl: ttl,
      });

      logger.info('[POST /api/push/test] テスト通知送信完了', {
        userId,
        characterId,
        sentCount,
      });
    } else {
      logger.info('[POST /api/push/test] 有効サブスクリプションなし（送信 0 件）', {
        userId,
        characterId,
      });
    }

    return NextResponse.json({ sent: sentCount, characterId }, { status: 200 });
  } catch (error) {
    logger.error('[POST /api/push/test] テスト通知送信に失敗しました', {
      userId,
      characterId,
      error: toErrorMessage(error),
    });
    return NextResponse.json(
      { error: 'SEND_FAILED', message: TEST_PUSH_ERROR_MESSAGES.SEND_FAILED },
      { status: 500 }
    );
  }
});
