import MessageValidator from 'sns-validator';

const ERROR_MESSAGES = {
  INVALID_MESSAGE: 'SNS メッセージが不正です',
  INVALID_SIGNATURE: 'SNS 署名の検証に失敗しました',
} as const;

export type SnsMessageType =
  | 'SubscriptionConfirmation'
  | 'Notification'
  | 'UnsubscribeConfirmation';

export type SnsMessage = {
  Type: SnsMessageType;
  Message?: string;
  Subject?: string;
  SubscribeURL?: string;
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
