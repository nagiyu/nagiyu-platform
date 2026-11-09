import { logger, toErrorMessage } from '@nagiyu/common';
import { ExplorationAngleSchema } from '../llm-client/schemas/exploration-angle.schema.js';
import type { ILLMClient } from '../llm-client/types.js';
import {
  buildExplorationAnglePrompt,
  type ExplorationAnglePromptInput,
} from './exploration-angle.prompt.js';

/**
 * 自発リサーチで、起点の Topic から広げた探索の角度 (Web 検索のクエリ) を 1 つ作るインターフェース。
 *
 * 作れなかったときは `null` を返す。呼び出し側 (acquire) は、その場合に起点の
 * 「最新情報」の検索へ落として勉強を止めない。
 */
export interface IExplorationAngleGenerator {
  generate(input: ExplorationAnglePromptInput): Promise<string | null>;
}

/**
 * `ILLMClient.chatStructured` による角度の生成の実装。
 *
 * 軽いモデル (`classify`) で足りる。生成に失敗した場合と、空のクエリが返った場合は
 * `null` を返し、呼び出し側のフォールバックに委ねる。
 */
export class LLMExplorationAngleGenerator implements IExplorationAngleGenerator {
  private readonly llmClient: ILLMClient;

  constructor(llmClient: ILLMClient) {
    this.llmClient = llmClient;
  }

  public async generate(input: ExplorationAnglePromptInput): Promise<string | null> {
    try {
      const result = await this.llmClient.chatStructured(
        buildExplorationAnglePrompt(input),
        ExplorationAngleSchema,
        { purpose: 'classify' }
      );
      const query = result.query.trim();
      return query === '' ? null : query;
    } catch (err) {
      logger.warn(
        '[LLMExplorationAngleGenerator] 角度の生成に失敗しました（呼び出し側が代替する）',
        {
          err: toErrorMessage(err),
        }
      );
      return null;
    }
  }
}
