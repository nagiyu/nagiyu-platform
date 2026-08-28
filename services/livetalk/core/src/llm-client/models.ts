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
 * @see Issue #3779 "GPT-5.6 系へのモデル移行"
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

/**
 * LLM 用途別 reasoning.effort 定数（一元管理）。
 *
 * dev 環境での実測（251 呼び出し、Issue #3780 Step 2）にもとづき、用途ごとに reasoning の
 * かけ方を変える。openai SDK の `ReasoningEffort` 型（`'none' | 'minimal' | 'low' | 'medium' |
 * 'high' | 'xhigh' | 'max' | null`）と突き合わせる作業は openai を import している client 側
 * （openai-client.ts 等）で行い、このファイルには openai の型依存を持ち込まない
 * （`libs/common` 同様、このファイルは openai SDK を import しない方針）。
 *
 * @see Issue #3780 "reasoning.effort の用途別チューニング"（Step 2: 実測にもとづく effort 設定）
 */
export const LLM_REASONING_EFFORT = {
  /**
   * 会話応答。reasoning は実際に発生している（reasoning/出力比 40.5%、reasoning 中央値 36
   * トークン）ため `none` にはせず `low` から刻む。ストリーミングの初回トークン遅延にも
   * effort が効くため、様子を見ながら下げる余地を残す。
   */
  conversation: 'low',
  /**
   * 会話圧縮要約。純粋な圧縮タスクだが reasoning 中央値 197 トークンとやや大きめのため、
   * 安全側に倒し `none` ではなく `low` とする。
   */
  summarize: 'low',
  /**
   * 分類。構造化抽出であり、実測 123 件中 26 件はモデル自身が reasoning 0 と判断している
   * （reasoning/出力比 49.2% だが出力自体が小さい構造化タスク）。`none` に倒す。
   */
  classify: 'none',
  /**
   * Web リサーチ。web_search 結果の統合を伴い reasoning 中央値 580 トークンと最大級のため、
   * `none` は品質劣化のリスクが高く危険。`low` にとどめる。
   */
  research: 'low',
} as const;
