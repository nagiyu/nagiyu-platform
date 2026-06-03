import type { ILLMClient } from '../llm-client/types.js';
import { EscalationSchema } from '../llm-client/schemas/escalation.schema.js';
import type { KnowledgeEntity } from '../entities/knowledge.entity.js';

export interface EscalationResult {
  isCritical: boolean;
  knowledgeId: string | null;
}

const ESCALATION_PROMPT = `あなたは通知の緊急度を判定するアシスタントです。
以下の知識情報が「新作リリース」「期間限定イベント」「緊急情報」に該当する場合のみ isCritical=true を返してください。
通常の雑学・最新トレンド・一般情報は isCritical=false です。判定基準を厳しく保ち、過剰なクリティカル判定を避けてください。`;

/**
 * KNOWLEDGE リストから時間帯外でも配信すべきクリティカル情報を LLM で判定する。
 *
 * - 候補が複数あっても最初の 1 件のみ返す（頻度キャップはバッチ側で担保）
 * - LLM 呼び出し失敗は best-effort（例外を握りつぶして null を返す）
 */
export async function detectCriticalKnowledge(
  knowledgeList: KnowledgeEntity[],
  llmClient: ILLMClient
): Promise<EscalationResult> {
  for (const knowledge of knowledgeList) {
    try {
      const result = await llmClient.chatStructured(
        [
          { role: 'system', content: ESCALATION_PROMPT },
          {
            role: 'user',
            content: `トピック: ${knowledge.Topic}\n要約: ${knowledge.Summary}`,
          },
        ],
        EscalationSchema
      );

      if (result.isCritical) {
        return { isCritical: true, knowledgeId: knowledge.KnowledgeID };
      }
    } catch {
      // best-effort: LLM 失敗は無視して次の候補へ
    }
  }

  return { isCritical: false, knowledgeId: null };
}
