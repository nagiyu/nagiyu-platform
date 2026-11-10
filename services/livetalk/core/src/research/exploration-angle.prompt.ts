import type { ChatMessage } from '../llm-client/types.js';

/** 角度の生成に渡す材料 */
export interface ExplorationAnglePromptInput {
  /** 起点にする Topic の主題 */
  subject: string;
  /** 起点にする Topic の正規化要約 */
  canonicalSummary: string;
  /** 利用者の発言から得た事実 (SELF fact) の本文 */
  selfFactTexts: readonly string[];
  /** すでに知っている Web 由来の事実の本文 (新しい側) */
  knownWebFactTexts: readonly string[];
  /** 最近探索した角度 (Web 検索のクエリ) */
  recentAngles: readonly string[];
  /** 今日の日付。年を含むクエリを作れるようにするために渡す */
  today: Date;
}

/** 年月日を `YYYY-MM-DD` で返す。ログ・プロンプトの表記をタイムゾーンの影響から切り離すためローカル時刻で組む */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function bulletList(items: readonly string[]): string {
  return items.length === 0 ? '(なし)' : items.map((item) => `- ${item}`).join('\n');
}

/**
 * 利用者の好きな話題から一歩広げた「探索の角度」を選ばせるプロンプトを組み立てる純粋関数。
 *
 * 外れてもよい前提にして、利用者がまだ知らなさそうな周辺の話題を選ばせる。
 * 同じ話題の「最新情報」を繰り返し取ってくるだけにならないよう、
 * 既知の事実と最近の角度を渡して重ならないようにさせる。
 */
export function buildExplorationAnglePrompt(input: ExplorationAnglePromptInput): ChatMessage[] {
  const system = [
    '利用者が好きな話題から一歩広げた周辺の話題を Web 検索で探すために、検索の角度を 1 つ選んでください。',
    '',
    '# 選び方',
    '- 起点の話題そのものの最新情報ではなく、そこから一歩広げた周辺を選びます。例: 関連するイベント・ライブ、新作、関わる人物、派生の話題。',
    '- 「すでに知っている事実」と「最近探索した角度」に重ならないものを選びます。',
    '- 利用者がまだ知らなさそうな観点を選びます。外れてもかまいません。会話のネタになればよいです。',
    '- 「利用者の発言から得た事実」は、角度を選ぶ手がかりです。センシティブな内容 (病気・家族・恋愛・お金など) には踏み込まず、趣味・関心の範囲で広げます。',
    '- 起点が気分・体調・悩み (憂鬱、眠気、疲れなど) のときは、その解決策や公的な情報には広げず、気分転換になる軽い話題 (楽しみになるイベント、ちょっとしたご褒美、季節の楽しみなど) へ広げます。説教っぽくならないようにします。例: 「仕事が憂鬱」なら「仕事帰り ご褒美スイーツ 2026」。',
    '',
    '# 出力',
    '- query: Web 検索にそのまま渡す短いクエリ (語を空白で区切る、20 文字程度まで)。',
    '- 年を含めたほうが新しい情報に当たるときは、今日の日付から年を含めます。例: 起点が「ボカロ」なら「ボカロ ライブ 2026」。',
    '- 説明文や記号は付けず、クエリだけを返します。',
  ].join('\n');

  const user = [
    `# 今日の日付\n${formatDate(input.today)}`,
    `# 起点の話題\n${input.subject}`,
    `# 起点の話題の要約\n${input.canonicalSummary || '(なし)'}`,
    `# 利用者の発言から得た事実\n${bulletList(input.selfFactTexts)}`,
    `# すでに知っている事実\n${bulletList(input.knownWebFactTexts)}`,
    `# 最近探索した角度\n${bulletList(input.recentAngles)}`,
  ].join('\n\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
