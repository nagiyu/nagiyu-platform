import { logger } from '@nagiyu/common';
import { WebFactChangeSchema } from '../llm-client/schemas/web-fact-change.schema.js';
import type { ILLMClient } from '../llm-client/types.js';
import type { ResearchResult } from './types.js';

/**
 * 鮮度切れ WEB fact の再取得結果が「実質的に変化したか」を判定するインターフェース
 * （リブトーク知識再設計 P3 / #3699、acquire バッチの鮮度掃引で使用）。
 *
 * 変化なしと判定された場合、acquire は WEBRAW を書かずに陳腐な再要約を止める。
 * `NextReview` はいずれの判定結果でも前方更新する（acquire 側の責務）。
 */
export interface IWebFactChangeDetector {
  hasChanged(existingText: string, fresh: ResearchResult): Promise<boolean>;
}

/**
 * `ILLMClient.chatStructured` による変化検知の実装。
 *
 * 判定に失敗した場合は安全側（`changed=true`）を返す。陳腐化した事実の取りこぼしより、
 * 再取得して consolidation の判断に委ねる方を優先する。
 */
export class LLMWebFactChangeDetector implements IWebFactChangeDetector {
  private readonly llmClient: ILLMClient;

  constructor(llmClient: ILLMClient) {
    this.llmClient = llmClient;
  }

  public async hasChanged(existingText: string, fresh: ResearchResult): Promise<boolean> {
    try {
      const result = await this.llmClient.chatStructured(
        [
          {
            role: 'system',
            content:
              '既知の事実と、新しく Web リサーチで取得した情報を比較し、実質的な変化があったかを判定してください。' +
              '表現の言い回しや順序の違いだけであれば変化なし（changed=false）、' +
              '内容が更新・追加・削除されていれば変化あり（changed=true）と判定します。',
          },
          {
            role: 'user',
            content: `# 既知の事実\n${existingText}\n\n# 新しく取得した情報\n${fresh.summary}`,
          },
        ],
        WebFactChangeSchema,
        { purpose: 'classify' }
      );
      return result.changed;
    } catch (err) {
      logger.warn('[LLMWebFactChangeDetector] 変化判定に失敗しました（安全側 changed=true）', {
        err,
      });
      return true;
    }
  }
}
