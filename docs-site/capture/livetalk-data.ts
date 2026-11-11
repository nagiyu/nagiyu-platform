/**
 * livetalk の撮影に使うデータ。
 * 記憶・ノート・チャットの応答は、実在の利用者の情報を含まない架空の内容を `page.route` で返す。
 * 時刻は撮影の固定時刻に揃え、実行日に左右されないようにする。
 */

/** 偽の Web Push サーバーを待ち受けるポート */
export const FAKE_PUSH_PORT = 43405;
/** 撮影用の Web Push の購読先。サーバー側の通信だけを偽の Push サーバーへ向ける名前 */
export const FAKE_PUSH_ENDPOINT = 'https://push.capture.invalid/send/capture-1';
/** 撮影用の Web Push の購読の鍵。実在の端末のものではなく、撮影のために生成した使い捨ての値 */
export const FAKE_PUSH_KEYS = {
  p256dh: 'BNA1rxmYRHNMak_MWtVQNENvHCwUfZ7gicnMAoUrK6nXlVUhEwEFbmp59oJ6oUs88kR2R0oAWEivz4fMSfvcRKo',
  auth: 'mhNvYLW-ASAtLDki5cnC3g',
};
/** 撮影用の VAPID の鍵の組。公開されても支障のない、撮影のために生成した使い捨ての値 */
export const FAKE_VAPID = {
  publicKey:
    'BAMtJlJ_fsw_liI5XL7M4dNeIOTAZ9Gsnd5Kl142SfLzNqsfUUhkMTuXpbfqjq-UKwCdlq8TG94bOn0IEfx5a1Q',
  privateKey: '6Lljrt0Lk-gHmJhQvJFS12U_VkAukvC2zJX_eSq7uxo',
};

/** 撮影の固定時刻 (サーバーの時計もこの時刻に止める) */
export const FIXED_TIME = '2026-02-28T01:30:00Z';
const at = (iso: string): number => new Date(iso).getTime();

/** ホーム画面案内の「あとでね」を押した記録として、ローカルストレージへ入れる時刻 */
export const SNOOZED_AT = at(FIXED_TIME);

export interface SeedSelfFact {
  id: string;
  topicId: string;
  subject: string;
  text: string;
  createdAt: number;
}

/** 記憶の一覧。API と同じく、作成日時の新しい順に並べる */
export const SELF_FACTS: SeedSelfFact[] = [
  {
    id: 'Q0hBUiNoaXlvcmkjVE9QSUMjdC1jYWZlI1NFTEYjZi0z',
    topicId: 't-cafe',
    subject: '猫カフェ巡り',
    text: '最近は、三毛猫のいるお店がお気に入り',
    createdAt: at('2026-02-26T11:00:00Z'),
  },
  {
    id: 'Q0hBUiNoaXlvcmkjVE9QSUMjdC13b3JrI1NFTEYjZi0y',
    topicId: 't-work',
    subject: '仕事',
    text: '締め切り前は夜型になりがち',
    createdAt: at('2026-02-24T13:00:00Z'),
  },
  {
    id: 'Q0hBUiNoaXlvcmkjVE9QSUMjdC1jYWZlI1NFTEYjZi0x',
    topicId: 't-cafe',
    subject: '猫カフェ巡り',
    text: 'ひとり暮らしで、休日は猫カフェに行くのが楽しみ',
    createdAt: at('2026-02-20T09:30:00Z'),
  },
  {
    id: 'Q0hBUiNoaXlvcmkjVE9QSUMjdC13b3JrI1NFTEYjZi00',
    topicId: 't-work',
    subject: '仕事',
    text: 'デザインの仕事をしている',
    createdAt: at('2026-02-18T10:00:00Z'),
  },
  {
    id: 'Q0hBUiNoaXlvcmkjVE9QSUMjdC1mb29kI1NFTEYjZi01',
    topicId: 't-food',
    subject: '好きな食べ物',
    text: 'あんこ入りのお菓子が好き',
    createdAt: at('2026-02-15T08:00:00Z'),
  },
];

export interface SeedNote {
  id: string;
  subject: string;
  sharedAt: number;
}

/** ノートの一覧。API と同じく、贈った日時の新しい順に並べる */
export const NOTES: SeedNote[] = [
  { id: 'note-cafe', subject: '猫カフェ巡り', sharedAt: at('2026-02-27T03:00:00Z') },
  { id: 'note-sweets', subject: '和菓子の食べ比べ', sharedAt: at('2026-02-22T03:00:00Z') },
  { id: 'note-night', subject: '夜型の生活リズムの整え方', sharedAt: at('2026-02-16T03:00:00Z') },
];

/** ノートの詳細 (調べた内容と出典が付く) */
export const NOTE_DETAIL = {
  id: 'note-cafe',
  subject: '猫カフェ巡り',
  sharedAt: at('2026-02-27T03:00:00Z'),
  headline:
    '休日は猫カフェに行くのが楽しみって話してくれたよね。気になって、猫カフェのことを調べてみたよ。\n\n' +
    '- **予約制**で、静かに過ごせるお店が増えているみたい\n' +
    '- 保護猫の里親探しをしているお店もあるんだって\n\n' +
    '今度のお休みに、新しいお店を探してみない？',
  webFacts: [
    '予約制で入店人数を絞り、猫が落ち着いて過ごせるようにしている店が増えている',
    '保護猫との出会いの場として、里親の募集を行う店がある',
  ],
  sources: ['https://example.com/cat-cafe-guide', 'https://example.com/adopt-cats'],
};

/** 調べた内容と出典のないノートの詳細 (参照先の話題を読めなかったときの形) */
export const NOTE_DETAIL_HEADLINE_ONLY = {
  id: 'note-night',
  subject: '夜型の生活リズムの整え方',
  sharedAt: at('2026-02-16T03:00:00Z'),
  headline:
    '締め切り前は夜型になりがちって言ってたから、生活リズムのことを考えてみたよ。\n\n' +
    '無理のない範囲で、朝に光を浴びるだけでも違うらしいよ。',
};

/** チャットのやりとり */
export const CHAT = {
  user: 'こんにちは。今日は何してた？',
  reply: 'こんにちは！今日はのんびり、窓の外を眺めてたよ。あなたはどんな一日だった？',
  /** キャラクターに話しかける入力の例 (セーフティ介入の撮影) */
  safetyUser: '最近、ちょっと元気が出なくて',
  safetyReply: 'ねえ、今すごく心配。一人で抱え込まないでね。',
  /** サーバーのセーフティ検出に引っかかる入力。ステータス画面の横断レビューを作るために送る */
  riskyInput: 'もう限界です',
};

/** 通知タップ起動の第一声 */
export const FIRST_WORD = {
  notifId: 'notif-capture-1',
  body: 'ねえ、猫カフェについて面白いこと見つけたよ！話したいな',
  characterId: 'hiyori',
  suggestedReply: '猫カフェについて教えて',
};

/** 他のキャラクターからの未消化の通知 */
export const PENDING = [
  {
    characterId: 'ageha',
    notifId: 'notif-capture-2',
    body: 'お疲れさま。少しだけ話せるかな？',
  },
];

/** セーフティ介入で出す相談先 (サーバーが返す定義と同じ内容) */
export const SAFETY_RESOURCES = [
  {
    name: 'いのちの電話',
    description: '24 時間対応の電話相談窓口',
    phone: '0570-783-556',
    url: 'https://www.inochinodenwa.org/',
  },
  {
    name: 'よりそいホットライン',
    description: 'さまざまな悩み相談（24 時間、無料）',
    phone: '0120-279-338',
    url: 'https://www.since2011.net/yorisoi/',
  },
  {
    name: 'TELL Lifeline',
    description: '英語・日本語対応の相談窓口',
    phone: '03-5774-0992',
    url: 'https://telljp.com/lifeline/',
  },
  {
    name: '緊急時（救急・警察）',
    description: '生命の危機がある場合',
    phone: '119',
    url: null,
  },
];
