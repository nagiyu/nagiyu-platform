import type { CharacterDefinition } from './types.js';
import type { MessageEntity } from '../entities/message.entity.js';
import type { MemoryEntity } from '../entities/memory.entity.js';
import type { ChatMessage } from '../llm-client/types.js';
import type { RetrievedMemory } from '../memory/types.js';

export type TimeOfDay = '朝' | '昼' | '夜';

export function getTimeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return '朝';
  if (hour >= 12 && hour < 18) return '昼';
  return '夜';
}

export function buildSystemPrompt(
  character: CharacterDefinition,
  now: Date,
  retrievedMemories: RetrievedMemory[] = [],
  summaryText?: string,
  newLearnings?: MemoryEntity[]
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

  if (!hasSummary && !hasMemories && !hasNewLearnings) return base;

  const sections: string[] = [base];

  if (hasSummary) {
    sections.push(`あなたがこれまでに知ったこと：\n${summaryText!.trim()}`);
  }

  if (hasMemories) {
    const memoriesSection = retrievedMemories.map((r) => `- ${r.memory.Content}`).join('\n');
    sections.push(`あなたが覚えていること：\n${memoriesSection}`);
  }

  if (hasNewLearnings) {
    const learningsSection = newLearnings!.map((m) => `- ${m.Content}`).join('\n');
    sections.push(
      `あなたが新しく知ったこと：\n${learningsSection}\n\n新しく知ったことについては、自然な流れで「覚えとくね」と伝えるか、あなたの感想を一言添えてください。ただし、毎回触れる必要はありません。`
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
  newLearnings?: MemoryEntity[]
): ChatMessage[] {
  const systemPrompt = buildSystemPrompt(character, now, retrievedMemories, summaryText, newLearnings);
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

  for (const msg of history) {
    if (msg.Role === 'user' || msg.Role === 'assistant') {
      messages.push({ role: msg.Role, content: msg.Text });
    }
  }

  messages.push({ role: 'user', content: userText });
  return messages;
}
