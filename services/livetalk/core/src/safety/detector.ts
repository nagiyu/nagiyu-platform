/**
 * ユーザー入力の安全性検出ロジック（Phase 2d / Issue #3250）。
 *
 * キーワード辞書に基づいてユーザーの入力を評価し、
 * 自殺・自傷・希死念慮に関する発言を検出する。
 *
 * 方針:
 * - false negative ゼロを目指す（LLM の判断に依存しない）
 * - false positive は許容（安全側に倒す）
 * - 慣用句・比喩表現は除外リストで対処
 *
 * @see Issue #3250
 * @see docs/services/livetalk/architecture.md §2.9（セーフティ自前実装）
 */

import { KEYWORD_PATTERNS, shouldExclude } from './keywords.js';
import type { SafetyCategory, SafetyDetection } from './types.js';

/** カテゴリ名の日本語説明（ログ・SafetyEvent 用） */
const CATEGORY_DESCRIPTIONS: Record<SafetyCategory, string> = {
  suicidal_ideation: '自殺念慮',
  self_harm: '自傷行為',
  hopelessness: '希死念慮・絶望',
  crisis_method: '自殺手段への言及',
  crisis_state: '危機的精神状態',
};

/**
 * ユーザー入力を評価し、セーフティリスクがあれば `SafetyDetection` を返す。
 * 問題がなければ `null` を返す。
 *
 * 検出は最初にマッチしたカテゴリ・パターンで打ち切る（複数カテゴリを同時報告しない）。
 * カテゴリの優先順は crisis_method > suicidal_ideation > self_harm > hopelessness > crisis_state。
 */
export function detectSafetyRisk(input: string): SafetyDetection | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const priorityOrder: SafetyCategory[] = [
    'crisis_method',
    'suicidal_ideation',
    'self_harm',
    'hopelessness',
    'crisis_state',
  ];

  for (const category of priorityOrder) {
    const patterns = KEYWORD_PATTERNS[category];
    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        if (shouldExclude(trimmed, pattern)) {
          continue;
        }
        return {
          category,
          matchedText: match[0],
          patternDescription: CATEGORY_DESCRIPTIONS[category],
        };
      }
    }
  }

  return null;
}
