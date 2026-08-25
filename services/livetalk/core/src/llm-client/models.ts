/**
 * LLM 用途別モデル定数（一元管理）。
 *
 * 各用途に使用するモデルをここで一元管理する。コスト方針：
 * - conversation / summarize / classify / research: `gpt-5.6-luna`（`gpt-5` / `gpt-5-mini` の
 *   廃止に伴う移行先。価格帯で見た実質の受け皿であり、structured outputs・function calling・
 *   web_search・image input を全用途分サポートするため、用途を分けず単一モデルに統一する）
 * - embedding: `text-embedding-3-small`（軽量・高速・低コスト。廃止対象外のため据え置き）
 *
 * 各 Provider 実装はこの定数から導出した形で既定モデルを定義する。
 *
 * @see Issue #3248 "用途別モデル振り分けの仕組み"
 * @see Issue #3530 "LLM プロンプト・モデル定数の一元化リファクタ"
 * @see Issue #3778 "OpenAI モデルアップグレード（gpt-5 / gpt-5-mini 廃止対応）"
 */
export const LLM_MODELS = {
  /**
   * 会話応答。`gpt-5` を長期に据え置く選択肢は廃止期日により不可能なため、
   * まず `gpt-5.6-luna` から開始し、品質の不足を感じた段階で上位モデルへ引き上げる方針とする
   */
  conversation: 'gpt-5.6-luna',
  /** 会話圧縮要約 */
  summarize: 'gpt-5.6-luna',
  /** 分類 */
  classify: 'gpt-5.6-luna',
  /** Web リサーチ */
  research: 'gpt-5.6-luna',
  /** テキスト埋め込み（1536 次元）。軽量・高速・低コスト */
  embedding: 'text-embedding-3-small',
} as const;
