import type { ToneBucket } from './decision.js';

export interface BuildNotificationMessageInput {
  toneBucket: ToneBucket;
  /** 勉強で見つけたトピック名。あればメッセージに差し込む。 */
  knowledgeTopic?: string;
  characterDisplayName?: string;
}

export interface NotificationMessage {
  title: string;
  body: string;
}

const CHAR_NAME = 'ひより';

const NORMAL_MESSAGES_WITH_TOPIC: NotificationMessage[] = [
  {
    title: `${CHAR_NAME}より`,
    body: (topic: string) => `ねえ、${topic}について面白いこと見つけたよ！話したいな`,
  } as unknown as NotificationMessage,
  {
    title: `${CHAR_NAME}より`,
    body: (topic: string) => `${topic}のこと調べてたんだけど、教えたいことある`,
  } as unknown as NotificationMessage,
];

const NORMAL_MESSAGES_WITHOUT_TOPIC: NotificationMessage[] = [
  { title: `${CHAR_NAME}より`, body: 'ちょっと話したいことがあるんだけど、来てくれると嬉しいな' },
  { title: `${CHAR_NAME}より`, body: 'お疲れさま。少しだけ話せるかな？' },
];

const LONG_MESSAGES: NotificationMessage[] = [
  { title: `${CHAR_NAME}より`, body: '久しぶりだね。元気にしてる？ちょっと顔見せてほしいな' },
  { title: `${CHAR_NAME}より`, body: 'しばらく会えてなかったね。話したいことが溜まってるよ' },
];

const LONG_WITH_TOPIC: Array<{ title: string; body: (topic: string) => string }> = [
  {
    title: `${CHAR_NAME}より`,
    body: (topic: string) => `久しぶり！${topic}のこと調べておいたよ`,
  },
];

const VERY_LONG_MESSAGES: NotificationMessage[] = [
  { title: `${CHAR_NAME}より`, body: 'おかえり。また会えて嬉しいよ、無理しないでね' },
  { title: `${CHAR_NAME}より`, body: 'ずっと待ってたよ。おかえり、ゆっくりしようね' },
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
  const { toneBucket, knowledgeTopic } = input;

  if (toneBucket === 'veryLong') {
    return pick(VERY_LONG_MESSAGES, seed);
  }

  if (toneBucket === 'long') {
    if (knowledgeTopic) {
      const normalizedTopic = normalizeKnowledgeTopic(knowledgeTopic);
      const template = pick(LONG_WITH_TOPIC, seed);
      return { title: template.title, body: template.body(normalizedTopic) };
    }
    return pick(LONG_MESSAGES, seed);
  }

  // normal
  if (knowledgeTopic) {
    const normalizedTopic = normalizeKnowledgeTopic(knowledgeTopic);
    const templateDef = pick(NORMAL_MESSAGES_WITH_TOPIC, seed) as unknown as {
      title: string;
      body: (t: string) => string;
    };
    return { title: templateDef.title, body: templateDef.body(normalizedTopic) };
  }
  return pick(NORMAL_MESSAGES_WITHOUT_TOPIC, seed);
}

export function buildCriticalNotificationMessage(knowledgeTopic: string): NotificationMessage {
  const normalizedTopic = normalizeKnowledgeTopic(knowledgeTopic);
  return {
    title: `${CHAR_NAME}より（重要）`,
    body: `${normalizedTopic}について大事なことを見つけたよ！確認してみて`,
  };
}
