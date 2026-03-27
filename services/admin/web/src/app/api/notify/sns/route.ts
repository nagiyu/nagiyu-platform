import { NextResponse } from 'next/server';
import {
  createPushSubscriptionRepository,
  validateSnsMessage,
  WebPushSender,
  type PushNotificationPayload,
} from '@nagiyu/admin-core';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { createErrorResponse } from '@nagiyu/nextjs';

const ERROR_MESSAGES = {
  INVALID_REQUEST: 'リクエストボディが不正です',
  INVALID_SIGNATURE: 'SNS 署名の検証に失敗しました',
  INTERNAL_ERROR: 'SNS 通知処理に失敗しました',
  DYNAMODB_TABLE_NAME_REQUIRED: 'DYNAMODB_TABLE_NAME が設定されていません',
  VAPID_KEYS_REQUIRED: 'VAPID キーが設定されていません',
} as const;

type SnsNotificationMessage = {
  AlarmName?: string;
  NewStateValue?: string;
  NewStateReason?: string;
};

function getRepository() {
  const docClient =
    process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
  const tableName = process.env.DYNAMODB_TABLE_NAME;

  if (!docClient) {
    return createPushSubscriptionRepository(undefined, undefined);
  }

  if (!tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
  }

  return createPushSubscriptionRepository(docClient, tableName);
}

function createNotificationPayload(subject?: string, rawMessage?: string): PushNotificationPayload {
  const defaultTitle = subject && subject.length > 0 ? subject : 'CloudWatch Alarm 通知';
  const defaultBody =
    rawMessage && rawMessage.length > 0 ? rawMessage : 'アラーム通知を受信しました';

  if (!rawMessage) {
    return {
      title: defaultTitle,
      body: defaultBody,
      icon: '/icon-192x192.png',
      data: { url: '/dashboard' },
    };
  }

  try {
    const parsed = JSON.parse(rawMessage) as SnsNotificationMessage;
    if (parsed.AlarmName && parsed.NewStateValue && parsed.NewStateReason) {
      return {
        title: `${parsed.AlarmName} (${parsed.NewStateValue})`,
        body: parsed.NewStateReason,
        icon: '/icon-192x192.png',
        data: { url: '/dashboard' },
      };
    }
  } catch {
    // CloudWatch Alarm 由来以外のメッセージはそのまま利用する
  }

  return {
    title: defaultTitle,
    body: defaultBody,
    icon: '/icon-192x192.png',
    data: { url: '/dashboard' },
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();

    let message;
    try {
      message = await validateSnsMessage(body);
    } catch {
      return createErrorResponse(401, 'UNAUTHORIZED', ERROR_MESSAGES.INVALID_SIGNATURE);
    }

    if (message.Type === 'SubscriptionConfirmation') {
      if (typeof message.SubscribeURL === 'string') {
        await fetch(message.SubscribeURL);
      }

      return NextResponse.json({ success: true }, { status: 200 });
    }

    if (message.Type === 'UnsubscribeConfirmation') {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error(ERROR_MESSAGES.VAPID_KEYS_REQUIRED);
    }

    const repository = getRepository();
    const sender = new WebPushSender({
      repository,
      vapidPublicKey,
      vapidPrivateKey,
    });

    const payload = createNotificationPayload(message.Subject, message.Message);
    const sendResult = await sender.sendAll(payload);

    return NextResponse.json({ success: true, ...sendResult }, { status: 200 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse(400, 'INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST);
    }

    console.error('SNS 通知受信 API の実行に失敗しました', { error });
    return createErrorResponse(500, 'INTERNAL_ERROR', ERROR_MESSAGES.INTERNAL_ERROR);
  }
}
