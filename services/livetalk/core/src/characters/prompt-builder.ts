import type { CharacterDefinition } from './types.js';
import type { MessageEntity } from '../entities/message.entity.js';
import type { MemoryEntity } from '../entities/memory.entity.js';
import type { KnowledgeEntity } from '../entities/knowledge.entity.js';
import type { NoteEntity } from '../entities/note.entity.js';
import type { ChatMessage } from '../llm-client/types.js';
import type { RetrievedMemory } from '../memory/types.js';
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

export function buildSystemPrompt(
  character: CharacterDefinition,
  now: Date,
  retrievedMemories: RetrievedMemory[] = [],
  summaryText?: string,
  newLearnings?: MemoryEntity[],
  lifecycleState?: LifecycleState,
  knowledgeContext?: KnowledgeEntity[],
  recentNotes?: NoteEntity[],
  notificationKnowledge?: KnowledgeEntity,
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

  const hasSummary = summaryText && summaryText.trim().length > 0;
  const hasMemories = retrievedMemories.length > 0;
  const hasNewLearnings = newLearnings !== undefined && newLearnings.length > 0;
  const isSleeping = lifecycleState === 'sleeping';
  const hasKnowledge = knowledgeContext !== undefined && knowledgeContext.length > 0;
  const hasRecentNotes = recentNotes !== undefined && recentNotes.length > 0;
  const hasNotificationKnowledge = notificationKnowledge !== undefined;
  // fact を 1 件以上持つ Topic が存在するかで判定する（SELF/WEB 両方 0 件の Topic のみの場合は
  // セクションを出さないため、単純な length > 0 では不足）。
  const hasTopics =
    retrievedTopics !== undefined &&
    retrievedTopics.some((rt) => rt.selfFacts.length > 0 || rt.webFacts.length > 0);

  if (
    !hasSummary &&
    !hasMemories &&
    !hasNewLearnings &&
    !isSleeping &&
    !hasKnowledge &&
    !hasRecentNotes &&
    !hasNotificationKnowledge &&
    !hasTopics
  )
    return base;

  const sections: string[] = [base];

  if (isSleeping) {
    sections.push(buildSleepingPrompt());
  }

  if (hasSummary) {
    sections.push(`あなたがこれまでに知ったこと：\n${summaryText!.trim()}`);
  }

  if (hasMemories) {
    const memoriesSection = retrievedMemories.map((r) => `- ${r.memory.Content}`).join('\n');
    sections.push(`あなたが覚えていること：\n${memoriesSection}`);
  }

  if (hasTopics) {
    sections.push(buildTopicsSection(retrievedTopics!));
  }

  if (hasNewLearnings) {
    const learningsSection = newLearnings!.map((m) => `- ${m.Content}`).join('\n');
    sections.push(
      `あなたが新しく知ったこと：\n${learningsSection}\n\n新しく知ったことについては、自然な流れで「覚えとくね」と伝えるか、あなたの感想を一言添えてください。ただし、毎回触れる必要はありません。`
    );
  }

  if (hasKnowledge) {
    const knowledgeSection = knowledgeContext!
      .map((k) => `- ${k.Topic}：${k.Summary}${k.RawComment ? `（${k.RawComment}）` : ''}`)
      .join('\n');
    sections.push(
      `この前調べたこと：\n${knowledgeSection}\n\n調べた内容について「この前の話なんだけど」「気になって調べちゃったんだよね」など、自然に会話に絡めてください。`
    );
  }

  if (hasRecentNotes) {
    const notesSection = recentNotes!.map((n) => `- ${n.Subject}`).join('\n');
    sections.push(
      `あなたが最近ユーザーに渡したノート：\n${notesSection}\n\nこれらはあなたがユーザーのために調べてまとめてプレゼントしたノートです。ユーザーがノートの感想（「あのノート良かった」「読んだよ」など）を言ったら、どのノートのことか理解して嬉しそうに反応してください。ユーザーが触れていないのに無理に話題にする必要はありません。`
    );
  }

  if (hasNotificationKnowledge) {
    const k = notificationKnowledge!;
    const detail = `- ${k.Topic}：${k.Summary}${k.RawComment ? `（${k.RawComment}）` : ''}`;
    sections.push(
      `あなたが通知でユーザーに話しかけた話題：\n${detail}\n\nユーザーはこの通知を受けて会話を始めました。この話題をあなた自身が始めた会話として自然に展開してください。「うん、${k.Topic}だけどね〜」や「そうそう、調べたらすごく面白くて！」のように、自分が振った話題として続けてください。`
    );
  }

  return sections.join('\n\n');
}

/**
 * LLM に渡す ChatMessage 配列を組み立てる。
 *
 * 構造: [system] + [...history] + [current user message]
 *
 * `history` は getRecentByTokenBudget で取得した時系列昇順のメッセージ群。
 * 現在のユーザー発話は保存前に呼ぶため history に含まれない前提。
 */
export function buildChatMessages(
  character: CharacterDefinition,
  now: Date,
  history: MessageEntity[],
  userText: string,
  retrievedMemories: RetrievedMemory[] = [],
  summaryText?: string,
  newLearnings?: MemoryEntity[],
  lifecycleState?: LifecycleState,
  knowledgeContext?: KnowledgeEntity[],
  recentNotes?: NoteEntity[],
  notificationKnowledge?: KnowledgeEntity,
  retrievedTopics?: RetrievedTopic[]
): ChatMessage[] {
  const systemPrompt = buildSystemPrompt(
    character,
    now,
    retrievedMemories,
    summaryText,
    newLearnings,
    lifecycleState,
    knowledgeContext,
    recentNotes,
    notificationKnowledge,
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
