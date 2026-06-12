import type { ToneBucket } from './decision.js';

export interface BuildNotificationMessageInput {
  toneBucket: ToneBucket;
  /** 勉強で見つけたトピック名。あればメッセージに差し込む。 */
  knowledgeTopic?: string;
  /**
   * 通知タイトルに使うカジュアルな呼び名（例: 'ひより'）。
   * CharacterDefinition.notificationName を渡すこと。
   * displayName（フルネーム）を渡すと「桃瀬ひよりより」のような二重表現になるため注意。
   */
  characterDisplayName: string;
}

export interface NotificationMessage {
  title: string;
  body: string;
}

/** Topic あり normal メッセージのテンプレート定義 */
const NORMAL_BODY_WITH_TOPIC: Array<(topic: string) => string> = [
  (topic) => `ねえ、${topic}について面白いこと見つけたよ！話したいな`,
  (topic) => `${topic}のこと調べてたんだけど、教えたいことある`,
];

/** Topic なし normal メッセージの本文テンプレート */
const NORMAL_BODY_WITHOUT_TOPIC: string[] = [
  'ちょっと話したいことがあるんだけど、来てくれると嬉しいな',
  'お疲れさま。少しだけ話せるかな？',
];

/** Topic なし long メッセージの本文テンプレート */
const LONG_BODY: string[] = [
  '久しぶりだね。元気にしてる？ちょっと顔見せてほしいな',
  'しばらく会えてなかったね。話したいことが溜まってるよ',
];

/** Topic あり long メッセージの本文テンプレート */
const LONG_BODY_WITH_TOPIC: Array<(topic: string) => string> = [
  (topic) => `久しぶり！${topic}のこと調べておいたよ`,
];

/** veryLong メッセージの本文テンプレート */
const VERY_LONG_BODY: string[] = [
  'おかえり。また会えて嬉しいよ、無理しないでね',
  'ずっと待ってたよ。おかえり、ゆっくりしようね',
];

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

/** Topic 末尾の句読点・改行を除去して通知テンプレートに安全に埋め込める形に正規化する */
function normalizeKnowledgeTopic(topic: string): string {
  return topic.trim().replace(/[。、．,\n\r]+$/, '');
}

export function buildNotificationMessage(
  input: BuildNotificationMessageInput,
  seed = Date.now()
): NotificationMessage {
  const { toneBucket, knowledgeTopic, characterDisplayName } = input;
  // キャラクター名をタイトルに差し込む
  const title = `${characterDisplayName}より`;

  if (toneBucket === 'veryLong') {
    return { title, body: pick(VERY_LONG_BODY, seed) };
  }

  if (toneBucket === 'long') {
    if (knowledgeTopic) {
      const normalizedTopic = normalizeKnowledgeTopic(knowledgeTopic);
      return { title, body: pick(LONG_BODY_WITH_TOPIC, seed)(normalizedTopic) };
    }
    return { title, body: pick(LONG_BODY, seed) };
  }

  // normal
  if (knowledgeTopic) {
    const normalizedTopic = normalizeKnowledgeTopic(knowledgeTopic);
    return { title, body: pick(NORMAL_BODY_WITH_TOPIC, seed)(normalizedTopic) };
  }
  return { title, body: pick(NORMAL_BODY_WITHOUT_TOPIC, seed) };
}

/**
 * 通知タップ起動時に入力欄へプリフィルするユーザー発話を生成する。
 *
 * @param knowledgeTopic - 通知の元となったトピック名（省略時は汎用文言を返す）
 * @returns 入力欄へプリフィルするサジェスト文字列
 */
export function buildSuggestedReply(knowledgeTopic?: string): string {
  if (knowledgeTopic) {
    const normalizedTopic = normalizeKnowledgeTopic(knowledgeTopic);
    return `${normalizedTopic}について教えて`;
  }
  return '話したいことってなに？';
}

/**
 * クリティカル通知のメッセージを生成する。
 *
 * @param knowledgeTopic - 通知の元となったトピック名
 * @param characterDisplayName - 通知タイトルに使うカジュアルな呼び名（CharacterDefinition.notificationName を渡すこと）
 */
export function buildCriticalNotificationMessage(
  knowledgeTopic: string,
  characterDisplayName: string
): NotificationMessage {
  const normalizedTopic = normalizeKnowledgeTopic(knowledgeTopic);
  return {
    title: `${characterDisplayName}より（重要）`,
    body: `${normalizedTopic}について大事なことを見つけたよ！確認してみて`,
  };
}
