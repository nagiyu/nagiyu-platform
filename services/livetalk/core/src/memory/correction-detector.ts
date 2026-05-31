/**
 * ユーザー入力の暗黙訂正検出（Phase 3d / Issue #3282）。
 *
 * フロー:
 *   1. キーワード検出（高速フィルタ）: 「いや」「違う」「実は」等
 *   2. 追加情報パターン除外: 「いや、それも好き」等は訂正ではなく補足
 *   3. LLM 最終判定（GPT-4o-mini 相当）: false positive 抑制
 *
 * 方針:
 * - false negative を低めに（ユーザーの訂正を無視するのは UX 致命傷）
 * - false positive は LLM 判定で抑制
 */

import { logger } from '@nagiyu/common';
import type { ILLMClient } from '../llm-client/types.js';
import type { MemoryEntity } from '../entities/memory.entity.js';
import type { RetrievedMemory } from './types.js';
import { CorrectionResponseSchema } from '../llm-client/schemas/correction.schema.js';

export interface CorrectionResult {
  detected: boolean;
  /** 訂正対象の Memory */
  targetMemories: MemoryEntity[];
  /** 訂正後の値（LLM が取得できた場合のみ） */
  newValue?: string;
}

/** 訂正を示すキーワードパターン */
const CORRECTION_KEYWORDS: RegExp[] = [
  /いや[、,\s！。]/,
  /いや$/,
  /(?:違う|ちがう)/,
  /実は/,
  /やっぱり/,
  /そうじゃない/,
  /そうでもない/,
  /(?:あれ|ちょっと)[、,\s]?(?:違|間違)/,
  /間違[いえ]/,
];

/**
 * 追加情報パターン（訂正ではなく補足・追加の可能性が高い）。
 * 「いや、それも好き」「違う、どちらも」等は除外する。
 */
const ADDITION_PATTERNS: RegExp[] = [
  /(?:いや|違う|ちがう)[、,\s].*?も(?:好き|嫌い|得意|苦手|ある|持って|やって)/,
  /(?:いや|違う|ちがう)[、,\s].*?(?:どちらも|両方|全部)/,
  /実は[、,\s].*?も(?:好き|嫌い|得意|苦手)/,
];

function hasKeyword(text: string): boolean {
  return CORRECTION_KEYWORDS.some((p) => p.test(text));
}

function isAdditionPattern(text: string): boolean {
  return ADDITION_PATTERNS.some((p) => p.test(text));
}

interface LLMCorrectionResponse {
  detected: boolean;
  targetMemoryIds?: string[];
  newValue?: string;
}

async function classifyWithLLM(
  userInput: string,
  previousAssistantMessage: string,
  memories: MemoryEntity[],
  llmClient: ILLMClient
): Promise<LLMCorrectionResponse> {
  if (memories.length === 0) return { detected: false };

  const memoriesText = memories.map((m) => `- ID: ${m.MemoryID}、内容: ${m.Content}`).join('\n');

  const prompt = `以下はキャラクターとユーザーの会話のやり取りです。

【キャラクターの直前の発話】
${previousAssistantMessage}

【ユーザーの最新の発話】
${userInput}

【キャラクターが参照していた記憶（ユーザーについての情報）】
${memoriesText}

ユーザーは上記の記憶のいずれかを訂正しようとしていますか？

判断基準:
- 「いや、それも好きだよ」のような追加情報は訂正ではありません
- 「違う、本当は〇〇なんだ」のような明確な否定・修正のみ訂正です
- ユーザーが会話の流れと無関係な訂正をする可能性は低いです

detected（訂正していれば true）、
targetMemoryIds（訂正対象の memoryId 配列、訂正がなければ空配列）、
newValue（訂正後の値が取れる場合のみ設定、取れない場合は null）
を返してください。`;

  try {
    const parsed = await llmClient.chatStructured(
      [{ role: 'user', content: prompt }],
      CorrectionResponseSchema,
      { purpose: 'classify' }
    );

    return {
      detected: parsed.detected,
      targetMemoryIds: parsed.detected ? (parsed.targetMemoryIds ?? []) : undefined,
      newValue: parsed.newValue ?? undefined,
    };
  } catch (err) {
    logger.warn('[correction-detector] LLM 訂正判定に失敗しました', { err });
    return { detected: false };
  }
}

/**
 * ユーザー入力が直前のキャラ応答で参照された Memory への訂正かを検出する。
 *
 * @param userInput - 現在のユーザー発話
 * @param previousAssistantMessage - 直前のキャラ応答テキスト
 * @param retrievedMemories - 直前ターンで取得・注入された Memory
 * @param llmClient - LLM クライアント（classify 用途）
 */
export async function detectCorrection(
  userInput: string,
  previousAssistantMessage: string,
  retrievedMemories: RetrievedMemory[],
  llmClient: ILLMClient
): Promise<CorrectionResult> {
  const empty: CorrectionResult = { detected: false, targetMemories: [] };

  if (!userInput.trim() || retrievedMemories.length === 0) return empty;

  // ステップ 1: キーワード検出（高速フィルタ）
  if (!hasKeyword(userInput)) return empty;

  // ステップ 2: 追加情報パターン除外
  if (isAdditionPattern(userInput)) return empty;

  // ステップ 3: LLM 最終判定
  const memories = retrievedMemories.map((r) => r.memory);
  const llmResult = await classifyWithLLM(userInput, previousAssistantMessage, memories, llmClient);

  if (!llmResult.detected || !llmResult.targetMemoryIds?.length) return empty;

  const targetMemoryIds = new Set(llmResult.targetMemoryIds);
  const targetMemories = memories.filter((m) => targetMemoryIds.has(m.MemoryID));

  if (targetMemories.length === 0) return empty;

  return {
    detected: true,
    targetMemories,
    newValue: llmResult.newValue,
  };
}
