/**
 * LLM 用途別モデル定数（一元管理）。
 *
 * 各用途に使用するモデルをここで一元管理する。コスト方針：
 * - conversation: `gpt-5`（会話の応答品質を優先）
 * - summarize / classify / research: `gpt-5-mini`（コスト最適化。stock-tracker / quick-clip と同じ選択）
 * - embedding: `text-embedding-3-small`（軽量・高速・低コスト）
 *
 * 各 Provider 実装はこの定数から導出した形で既定モデルを定義する。
 *
 * @see Issue #3248 "用途別モデル振り分けの仕組み"
 * @see Issue #3530 "LLM プロンプト・モデル定数の一元化リファクタ"
 */
export const LLM_MODELS = {
  /** 会話応答。応答品質を最優先するため高性能モデルを使用 */
  conversation: 'gpt-5',
  /** 会話圧縮要約。コスト最適化のため mini モデルを使用 */
  summarize: 'gpt-5-mini',
  /** 分類。コスト最適化のため mini モデルを使用 */
  classify: 'gpt-5-mini',
  /** Web リサーチ。コスト最適化のため mini モデルを使用 */
  research: 'gpt-5-mini',
  /** テキスト埋め込み（1536 次元）。軽量・高速・低コスト */
  embedding: 'text-embedding-3-small',
} as const;
