import MessageValidator from 'sns-validator';

const ERROR_MESSAGES = {
  INVALID_MESSAGE: 'SNS メッセージが不正です',
  INVALID_SIGNATURE: 'SNS 署名の検証に失敗しました',
} as const;

export type SnsMessageType =
  'SubscriptionConfirmation' | 'Notification' | 'UnsubscribeConfirmation';

export type SnsMessage = {
  Type: SnsMessageType;
  Message?: string;
  Subject?: string;
  SubscribeURL?: string;
  TopicArn?: string;
  [key: string]: unknown;
};

const validator = new MessageValidator();

/**
 * SNS メッセージの署名を検証する。
 */
export async function validateSnsMessage(message: unknown): Promise<SnsMessage> {
  if (!message || typeof message !== 'object' || !('Type' in message)) {
    throw new Error(ERROR_MESSAGES.INVALID_MESSAGE);
  }

  return new Promise<SnsMessage>((resolve, reject) => {
    validator.validate(message as Record<string, unknown>, (error, validatedMessage) => {
      if (error) {
        reject(new Error(ERROR_MESSAGES.INVALID_SIGNATURE));
        return;
      }

      resolve(validatedMessage as SnsMessage);
    });
  });
}

const SNS_HOSTNAME_PATTERN = /^sns\.[a-z0-9-]+\.amazonaws\.com$/;

/**
 * SubscribeURL が AWS SNS の確認用 URL かを判定する。
 *
 * 署名検証は証明書の取得時の TLS に信頼を預けているため、検証が破られた場合でも
 * 任意の宛先へ取得に行かないよう、取得先を AWS SNS のリージョン別エンドポイントに限る (多層防御)。
 * ホスト名の完全一致に加え、`@` を使ったホスト偽装やポート指定を排除するため
 * ユーザー情報とポートの有無も確かめる。
 */
export function isSnsSubscribeUrl(url: unknown): url is string {
  if (typeof url !== 'string') {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  return (
    parsed.protocol === 'https:' &&
    SNS_HOSTNAME_PATTERN.test(parsed.hostname) &&
    parsed.port === '' &&
    parsed.username === '' &&
    parsed.password === ''
  );
}
