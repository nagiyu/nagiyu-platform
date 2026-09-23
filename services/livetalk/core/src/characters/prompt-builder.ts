import type { CharacterDefinition } from './types.js';
import type { MessageEntity } from '../entities/message.entity.js';
import type { NoteEntity } from '../entities/note.entity.js';
import type { ChatMessage } from '../llm-client/types.js';
import type { LifecycleState } from '../entities/lifecycle.entity.js';
import type { RetrievedTopic } from '../knowledge/retrieval.js';

export type TimeOfDay = '朝' | '昼' | '夜';

export function getTimeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return '朝';
  if (hour >= 12 && hour < 18) return '昼';
  return '夜';
}

/**
 * sleeping 状態のキャラクター演出用プロンプト追記。
 * アイドルモーションが上書きする目パラメータとは独立して、口調・文体を寝ぼけ風に変調する。
 * 特定キャラの口癖ワードは含めず、眠い状態・振る舞いのみを指示することで
 * 各キャラが自分の speechStyle に従って表現できるようにする。
 */
function buildSleepingPrompt(): string {
  return `今のあなたは眠くて半分うとうとした状態で返事をしています。
- 返答はとくに短く（1〜2 文）
- 言葉が途中で途切れたり、ぼんやりした言い方になる
- 多少ちぐはぐでも OK。眠くて寝ぼけている状態として振る舞う`;
}

/**
 * 想起（関連度 only）で選抜された Topic 群を「あなたが覚えていること（今の話題に関連）」
 * セクションとして描画する（リブトーク知識再設計 P2 / #3698）。
 *
 * SELF/WEB それぞれ、facet が空なら該当行を出さない。
 * SELF/WEB が両方 0 件の Topic は「■ subject」見出しごとスキップする（fresh-eyes レビュー指摘）。
 * 全 Topic がスキップされ描画対象がなくなった場合は空文字を返す（呼び出し側でセクション自体を出さない）。
 */
function buildTopicsSection(retrievedTopics: RetrievedTopic[]): string {
  const topicBlocks = retrievedTopics
    .filter((rt) => rt.selfFacts.length > 0 || rt.webFacts.length > 0)
    .map((rt) => {
      const lines: string[] = [`■ ${rt.topic.Subject}`];
      for (const selfFact of rt.selfFacts) {
        lines.push(`- （あなたが聞いたこと）${selfFact.Text}`);
      }
      for (const webFact of rt.webFacts) {
        lines.push(`- （あなたが調べたこと）${webFact.Text}`);
      }
      return lines.join('\n');
    });

  if (topicBlocks.length === 0) return '';

  return `あなたが覚えていること（今の話題に関連）：\n${topicBlocks.join('\n')}`;
}

/**
 * system prompt を組み立てる（リブトーク知識・記憶再設計 P5 / Topic 中心モデルへ簡素化）。
 *
 * 旧 Tier memory / MemorySummary / 旧 Knowledge / 通知起点 KNOWLEDGE のセクション生成は撤去済み。
 * 想起は Topic（関連度 only）のみを扱う。
 */
export function buildSystemPrompt(
  character: CharacterDefinition,
  now: Date,
  lifecycleState?: LifecycleState,
  recentNotes?: NoteEntity[],
  retrievedTopics?: RetrievedTopic[]
): string {
  const { personality, displayName } = character;
  const timeOfDay = getTimeOfDay(now);
  const likesList = personality.preferences.likes.join('、');
  const dislikesList = personality.preferences.dislikes.join('、');

  const base = `${personality.basePrompt}

名前: ${displayName}
口調: ${personality.speechStyle}
好きなもの: ${likesList}
苦手なもの: ${dislikesList}
現在の時間帯: ${timeOfDay}

会話のルール:
- 質問攻めにしない。まず自分の気持ちや体験を話し、相手が自然に話したくなる流れを作る
- 返答は短く（1〜3 文程度）、テンポよく続ける
- セーフティ対応は後続ロジックで処理されるため、ここでは扱わない`.trim();

  const isSleeping = lifecycleState === 'sleeping';
  const hasRecentNotes = recentNotes !== undefined && recentNotes.length > 0;
  // fact を 1 件以上持つ Topic が存在するかで判定する（SELF/WEB 両方 0 件の Topic のみの場合は
  // セクションを出さないため、単純な length > 0 では不足）。
  const hasTopics =
    retrievedTopics !== undefined &&
    retrievedTopics.some((rt) => rt.selfFacts.length > 0 || rt.webFacts.length > 0);

  if (!isSleeping && !hasRecentNotes && !hasTopics) return base;

  const sections: string[] = [base];

  if (isSleeping) {
    sections.push(buildSleepingPrompt());
  }

  if (hasTopics) {
    sections.push(buildTopicsSection(retrievedTopics!));
  }

  if (hasRecentNotes) {
    const notesSection = recentNotes!.map((n) => `- ${n.Subject}`).join('\n');
    sections.push(
      `あなたが最近ユーザーに渡したノート：\n${notesSection}\n\nこれらはあなたがユーザーのために調べてまとめてプレゼントしたノートです。ユーザーがノートの感想（「あのノート良かった」「読んだよ」など）を言ったら、どのノートのことか理解して嬉しそうに反応してください。ユーザーが触れていないのに無理に話題にする必要はありません。`
    );
  }

  return sections.join('\n\n');
}

/**
 * LLM に渡す ChatMessage 配列を組み立てる。
 *
 * 構造: [system] + [...history] + [current user message]
 *
 * `history` は集約カーソル境界（未集約分）で取得した時系列昇順のメッセージ群。
 * 現在のユーザー発話は保存前に呼ぶため history に含まれない前提。
 */
export function buildChatMessages(
  character: CharacterDefinition,
  now: Date,
  history: MessageEntity[],
  userText: string,
  lifecycleState?: LifecycleState,
  recentNotes?: NoteEntity[],
  retrievedTopics?: RetrievedTopic[]
): ChatMessage[] {
  const systemPrompt = buildSystemPrompt(
    character,
    now,
    lifecycleState,
    recentNotes,
    retrievedTopics
  );
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

  for (const msg of history) {
    if (msg.Role === 'user' || msg.Role === 'assistant') {
      messages.push({ role: msg.Role, content: msg.Text });
    }
  }

  messages.push({ role: 'user', content: userText });
  return messages;
}
