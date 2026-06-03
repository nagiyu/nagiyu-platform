/**
 * リブトーク全体で参照するドメイン定数。
 *
 * MVP では桃瀬ひより 1 キャラのみを扱うため characterId は固定値とする
 * （将来の拡張は `docs/services/livetalk/roadmap.md` も参照）。
 */
export const DEFAULT_CHARACTER_ID = 'hiyori';

/**
 * Message に付与する DynamoDB TTL（秒）。
 * Phase 3 で圧縮要約に置き換わるまでの保持期間。
 */
export const MESSAGE_TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * LLM プロンプトに渡せるコンテキストのトークン上限の既定値。
 * 環境変数 `LLM_CONTEXT_TOKEN_LIMIT` で上書きできる。
 */
export const DEFAULT_LLM_CONTEXT_TOKEN_LIMIT = 40_000;

/**
 * トークン上限ベースのスキャンで 1 ページに読み込むメッセージ件数。
 * 上限到達時に余分な RCU を消費しないよう小さめに設定する。
 */
export const TOKEN_BUDGETED_QUERY_PAGE_SIZE = 50;

/**
 * 利用規約・プライバシーポリシーのバージョン。
 * 改定時にインクリメントし、ユーザーの再同意を促す。
 */
export const LIVETALK_TERMS_VERSION = '1.0.0';
export const LIVETALK_PRIVACY_VERSION = '1.0.0';

/**
 * Memory Tier C に付与する DynamoDB TTL（秒）。30 日後に自動削除。
 */
export const MEMORY_TIER_C_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Memory Tier D に付与する DynamoDB TTL（秒）。1 日後に自動削除。
 */
export const MEMORY_TIER_D_TTL_SECONDS = 1 * 24 * 60 * 60;

/**
 * Memory cooldown 判定閾値（ミリ秒）。
 * 同じ Memory を直近 30 分以内に参照済みの場合は retrieve 対象外にする。
 */
export const MEMORY_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Tier B retrieve の既定上限件数。
 */
export const MEMORY_MAX_TIER_B = 5;

/**
 * 1 LLM 呼び出し単位で同カテゴリの Tier B Memory を注入できる最大件数。
 */
export const MEMORY_CATEGORY_CAP = 1;

/**
 * 各 Tier の信頼度スコア推奨初期値。
 * 実際の決定は usecase 層（Phase 3b）に委ねる。Repository はこの値を参照しない。
 */
export const MEMORY_DEFAULT_CONFIDENCE = {
  A: 1.0,
  B: 0.8,
  C: 0.5,
  D: 0.2,
} as const;

/**
 * 訂正検出時に対象 Memory の Confidence から差し引くペナルティ値（Phase 3d）。
 * 0.8 → 0.5 → 0.2 と 3 回連続訂正で自動削除閾値に達する設計。
 */
export const CORRECTION_CONFIDENCE_PENALTY = 0.3;

/**
 * Confidence がこの値を下回った Memory は自動削除する閾値（Phase 3d）。
 */
export const MEMORY_AUTO_DELETE_THRESHOLD = 0.2;

/**
 * 「覚えとくね」発話を促すプロンプトに同一 Memory を含める間隔（ミリ秒）。
 * 同じ記憶について毎ターン「覚えとくね」と言わないための cooldown（Phase 3d）。
 */
export const CONFIRMATION_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 時間

/**
 * 親密度: 1 件の C→B 昇格（情報開示）に対する加算量（Phase 3f）。
 */
export const AFFECTION_INFO_DISCLOSURE_WEIGHT = 0.5;

/**
 * 親密度: 新規接触日に対する加算量（Phase 3f）。
 */
export const AFFECTION_TIME_CONTINUITY_BONUS = 1.0;

/**
 * 親密度: 双方向性スコア（0〜1）に乗算する係数（Phase 3f）。
 * bidirectionalityScore * AFFECTION_BIDIRECTIONALITY_WEIGHT が 1 日分の加算量。
 */
export const AFFECTION_BIDIRECTIONALITY_WEIGHT = 1.0;

/**
 * 生活サイクルのデフォルト就寝時刻（"HH:mm" 形式、Asia/Tokyo 基準）。
 * ユーザーが設定を持たない場合にフォールバックする値（Phase 4b）。
 */
export const LIFECYCLE_DEFAULT_BEDTIME = '01:30';

/**
 * 生活サイクルのデフォルト起床時刻（"HH:mm" 形式、Asia/Tokyo 基準）。
 * ユーザーが設定を持たない場合にフォールバックする値（Phase 4b）。
 */
export const LIFECYCLE_DEFAULT_WAKE_UP_TIME = '09:30';

/**
 * Tier C 記憶の「再言及」と判定する cosine similarity 下限閾値（Phase 3d）。
 *
 * 保存ベクトルは記憶の説明文（三人称）、クエリは生の口語発話（一人称）で
 * 文体が異なるため、明確な再言及でも cosine は 0.6〜0.7 程度に留まる
 * （dev 検証で「モンハン」再言及が 0.68 を記録し、閾値 0.7 で取りこぼした）。
 * 類似度は粗いプレフィルタとし、最終的な昇格可否は後段の LLM 判定に委ねるため、
 * 緩めの 0.5 に設定する（無関係な話題は cosine ≤ 0.4 で十分に分離できる）。
 */
export const PROMOTION_SIMILARITY_THRESHOLD = 0.5;

/**
 * 興味カテゴリの dedup（重複統合）と判定する cosine similarity 下限閾値（Phase 5 着手前の宿題、Issue #3325）。
 *
 * 興味カテゴリ名は短い名詞句（「コーヒー」「映画鑑賞」など）で、Memory 本文より文体差が小さいため
 * 同義であれば cosine 0.85 以上に出る（dev 実データで「コーヒー」と「コーヒー・飲み物」は約 0.9）。
 * 過剰統合（無関係カテゴリの誤統合）を避けるため Memory 昇格よりは厳しめに設定する。
 */
export const INTEREST_DEDUP_SIMILARITY_THRESHOLD = 0.85;

/**
 * 勉強バッチ: 1 実行あたりに発行する検索クエリの最大数（暴走防止）。
 */
export const STUDY_MAX_QUERIES_PER_RUN = 3;

/**
 * 勉強バッチ: 前回勉強からの最短間隔（時間）。
 * この時間が経過していない場合は勉強をスキップする。
 */
export const STUDY_MIN_INTERVAL_HOURS = 6;

/**
 * 勉強バッチ: ユーザーのピーク活動時間帯を避けるウィンドウ（時間）。
 * morningPeak / eveningPeak の前後この時間内はユーザーが活動中とみなしてスキップ。
 */
export const STUDY_INACTIVE_WINDOW_HOURS = 2;

/**
 * 勉強バッチ: 品質が低い（要約が短すぎる）と判定する文字数閾値。
 * summary がこの文字数未満の場合は保存しない。
 */
export const STUDY_MIN_SUMMARY_LENGTH = 50;

/**
 * StudyTopic に付与する DynamoDB TTL（秒）。30 日後に自動削除。
 */
export const STUDY_TOPIC_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * 知識ゲート経由で登録された StudyTopic の優先度。
 * 通常の勉強バッチ（Priority=1）より高くして先に処理させる。
 */
export const STUDY_TOPIC_GATE_PRIORITY = 10;

/**
 * 知識ゲートのキーワード照合（N-gram マッチャ）の最小一致率。
 * ユーザー発話の文字 2-gram のうち、知識テキストに含まれる割合がこの値以上なら
 * knowledge_hit とみなす。日本語はスペース分割できないため substring 照合だと
 * 自然文を取りこぼすので、文字 2-gram の重なり率で再現率を確保する。
 * 0.5 は dev 実データでの実測に基づく値（既知トピックを拾いつつ無関係語を弾く境界）。
 */
export const KNOWLEDGE_MATCH_MIN_RATIO = 0.5;

/**
 * ノート生成（Phase 5c / #3345）: KNOWLEDGE をノート化する際の品質ゲート。
 * Summary がこの文字数未満の KNOWLEDGE はノート化しない（薄い知識の乱発防止）。
 * 勉強バッチ保存時の STUDY_MIN_SUMMARY_LENGTH（50）より厳しくして「高品質なものだけ」を昇格する。
 */
export const NOTE_MIN_SUMMARY_LENGTH = 80;

/**
 * ノート生成: 1 実行・1 ユーザーあたりに生成するノートの最大数（乱発防止）。
 */
export const NOTE_MAX_PER_RUN = 2;

/**
 * ノート生成: ノート化候補としてスキャンする直近 KNOWLEDGE の最大件数。
 */
export const NOTE_KNOWLEDGE_LOOKBACK = 20;

/**
 * 感想連携: チャットの context に注入する「直近に提示したノート」の対象日数。
 * この日数内に作成されたノートを LLM に渡し、ユーザーの感想にキャラが反応できるようにする。
 */
export const NOTE_RECENT_DAYS = 7;

/**
 * 感想連携: チャットの context に注入するノートの最大件数（プロンプト肥大の抑制）。
 */
export const NOTE_RECENT_LIMIT = 3;

// ---- プッシュ通知（Phase 5d / #3346）----

/**
 * 適応的間隔の中央値算出に使う直近セッション数の上限。
 * サンプルが少ない場合はある分だけで中央値を取る。
 */
export const NOTIFY_RECENT_SESSION_SAMPLE_N = 10;

/**
 * セッション分割の閾値（分）。
 * 連続メッセージ間の間隔がこれ以上なら新セッション開始とみなす。
 */
export const NOTIFY_SESSION_GAP_MINUTES = 60;

/**
 * 間隔サンプルが 0 個（事実上初回）のときのデフォルト基準間隔（時間）。
 */
export const NOTIFY_DEFAULT_BASE_HOURS = 24;

/**
 * 適応的間隔の下限（時間）。連投防止。
 */
export const NOTIFY_BASE_MIN_HOURS = 12;

/**
 * 適応的間隔の上限（日）。この値を超えたら通知停止。
 */
export const NOTIFY_MAX_INTERVAL_DAYS = 14;

/**
 * 指数バックオフの底。反応なしのたびに基準間隔をこの倍率で拡大する。
 */
export const NOTIFY_BACKOFF_BASE = 1.5;

/**
 * 1日に送る平常通知の上限件数。
 */
export const NOTIFY_DAILY_NORMAL_CAP = 1;

/**
 * 1日に送るクリティカル通知の上限件数。
 */
export const NOTIFY_DAILY_CRITICAL_CAP = 1;

/**
 * 活動時間帯の判定ウィンドウ（分）。
 * morningPeak / eveningPeak の前後この分以内を「活動時間帯」とみなす。
 */
export const NOTIFY_ACTIVE_WINDOW_MINUTES = 90;

/**
 * NotificationEvent に付与する DynamoDB TTL（秒）。30日後に自動削除。
 */
export const NOTIFICATION_EVENT_TTL_SECONDS = 30 * 24 * 60 * 60;
