import OpenAI from 'openai';
import { withRetry } from './retry.js';

const OPENAI_MODEL = 'gpt-5-mini';
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 120_000;

export interface HistoricalPriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface AiAnalysisInput {
  tickerId: string;
  name: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  buyPatternCount: number;
  sellPatternCount: number;
  patternSummary: string;
  historicalData: HistoricalPriceData[];
  chartImageBase64?: string;
}

export async function generateAiAnalysis(apiKey: string, input: AiAnalysisInput): Promise<string> {
  const client = new OpenAI({
    apiKey,
    maxRetries: 0,
  });

  const response = await withRetry(
    async () =>
      withTimeout(
        client.responses.create({
          model: OPENAI_MODEL,
          stream: false,
          tools: [{ type: 'web_search' }],
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: createPrompt(input),
                },
                ...(input.chartImageBase64
                  ? [
                      {
                        type: 'input_image' as const,
                        image_url: input.chartImageBase64,
                        detail: 'auto' as const,
                      },
                    ]
                  : []),
              ],
            },
          ],
        }),
        REQUEST_TIMEOUT_MS
      ),
    { maxRetries: MAX_RETRIES }
  );

  const outputText = response.output_text?.trim();
  if (!outputText) {
    throw new Error('AI解析の応答が空です');
  }

  return outputText;
}

function createPrompt(input: AiAnalysisInput): string {
  const historicalDataLines = formatHistoricalData(input.historicalData);

  return [
    'あなたは株式分析の専門家です。以下の情報を基に日本語で2000文字以内の解析を作成してください。',
    '- 価格動向の解釈',
    '- パターン分析結果の意味',
    '- 関連する市場・セクター動向（必要に応じてWeb検索を利用）',
    `ティッカーID: ${input.tickerId}`,
    `銘柄名: ${input.name}`,
    `日付: ${input.date}`,
    `始値: ${input.open}`,
    `高値: ${input.high}`,
    `安値: ${input.low}`,
    `終値: ${input.close}`,
    `買いシグナル合致数: ${input.buyPatternCount}`,
    `売りシグナル合致数: ${input.sellPatternCount}`,
    `合致パターン: ${input.patternSummary || 'なし'}`,
    '',
    '【過去50日間の価格推移】',
    '日付, 始値, 高値, 安値, 終値',
    ...historicalDataLines,
  ].join('\n');
}

function formatHistoricalData(historicalData: HistoricalPriceData[]): string[] {
  if (historicalData.length === 0) {
    return ['データなし'];
  }

  return [...historicalData]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point) => `${point.date}, ${point.open}, ${point.high}, ${point.low}, ${point.close}`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('OpenAI APIの呼び出しがタイムアウトしました'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
