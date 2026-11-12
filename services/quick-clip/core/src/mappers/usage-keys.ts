/**
 * 利用回数に関するアイテムのキー。
 *
 * ジョブ (`JOB#`) や見どころ (`HIGHLIGHT#`) と同じテーブルに同居するため、接頭辞を `USAGE` 系に分けて衝突を避ける。
 * 回数は主体 (ユーザー / 匿名 ID) と月ごとに 1 アイテムで、AI あり・なしを別の属性で数える。
 */

/** 回数を数える主体を表す文字列。ログイン中はユーザー ID、未ログインは発行した識別子 */
export const buildUserSubject = (userId: string): string => `USER#${userId}`;
export const buildAnonymousSubject = (anonymousId: string): string => `ANON#${anonymousId}`;

export const buildCounterKey = (subject: string, month: string): { PK: string; SK: string } => ({
  PK: `USAGE#${subject}`,
  SK: `MONTH#${month}`,
});

/** 塩のキーの接頭辞。塩の mapper がキーから日付を読み戻すときにも使う */
export const SALT_KEY_PREFIX = 'USAGE_SALT#';

export const buildSaltKey = (day: string): { PK: string; SK: string } => ({
  PK: `${SALT_KEY_PREFIX}${day}`,
  SK: `${SALT_KEY_PREFIX}${day}`,
});

export const buildIpKey = (day: string, ipHash: string): { PK: string; SK: string } => ({
  PK: `USAGE_IP#${day}`,
  SK: `IP#${ipHash}`,
});

export const COUNTER_ITEM_TYPE = 'USAGE_COUNTER';
export const SALT_ITEM_TYPE = 'USAGE_SALT';
export const IP_ITEM_TYPE = 'USAGE_IP';

/** 回数の属性名。AI 解析の種類ごとに分ける */
export const COUNTER_ATTRIBUTES = { ai: 'AiCount', noAi: 'NoAiCount' } as const;

/** IP ごとの日次ジョブ数の属性名 */
export const IP_COUNT_ATTRIBUTE = 'Count';
