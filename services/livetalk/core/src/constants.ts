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
 * 勉強バッチ: ユーザーのピーク活動時間帯を避けるウィンドウ（時間）。
 * morningPeak / eveningPeak の前後この時間内はユーザーが活動中とみなしてスキップ。
 * acquire バッチ（care 自発リサーチ）が引き続き使用する。
 */
export const STUDY_INACTIVE_WINDOW_HOURS = 2;

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
 * ノート生成（リブトーク知識・記憶再設計 P4「ノート（ギフト化）」）: Topic をノート化する
 * 際の care 閾値。care は新規 Topic 作成時に 1、consolidation での既存 Topic 更新（名寄せ）時に
 * +1 されるため、この値は「数回話題に触れた（会話・調べ物が複数回積み上がった）Topic」を
 * 目安にした値（乱発防止のための品質ゲート）。
 */
export const NOTE_CARE_THRESHOLD = 3;

/**
 * ノート生成: 1 実行・1 ユーザーあたりに生成するノートの最大数（乱発防止）。
 */
export const NOTE_MAX_PER_RUN = 2;

/**
 * ノート生成: care 降順でノート化候補としてスキャンする Topic の最大件数。
 */
export const NOTE_CANDIDATE_LOOKBACK = 20;

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
 * 適応的間隔の下限（時間）。
 * 活動的ユーザーの間隔下限。casual はセッション中央値≒24h のため
 * この floor は事実上効かない。連投防止は動的 cap と backoff で担保。
 * Phase 2 で 12 → 4 に引き下げ（活発ユーザー向け）。
 */
export const NOTIFY_BASE_MIN_HOURS = 4;

/**
 * 適応的間隔の上限（日）。この値を超えたら通知停止。
 */
export const NOTIFY_MAX_INTERVAL_DAYS = 14;

/**
 * 指数バックオフの底。反応なしのたびに基準間隔をこの倍率で拡大する。
 */
export const NOTIFY_BACKOFF_BASE = 1.5;

/**
 * 1日に送る平常通知の上限件数（動的 cap の下限）。
 * casual ユーザー（intensityFactor=1）はこの値が使われる。
 */
export const NOTIFY_DAILY_NORMAL_CAP = 1;

/**
 * 動的 1 日上限（平常通知）の上限値。
 * 活発ユーザーでも 1 日 3 件を超えて送らない。
 * intensityFactor が 3 を超えても cap はこの値で打ち止め。
 */
export const NOTIFY_DAILY_NORMAL_CAP_MAX = 3;

/**
 * 強度信号の算出に使う直近期間（日）。
 * この期間内のセッション数から session/日 を計算する。
 */
export const NOTIFY_INTENSITY_WINDOW_DAYS = 7;

/**
 * intensityFactor=1（頻度を上げない境界）となる session/日 の閾値。
 * これ未満のユーザーは factor=1 に固定され、従来通り cap=1・interval は縮まらない。
 * dev 実測で活発ユーザー≒4.4 session/日 を踏まえた暫定値。
 * 実運用データを踏まえてチューニングすること。
 */
export const NOTIFY_INTENSITY_BASELINE_SESSIONS_PER_DAY = 1.5;

/**
 * intensityFactor の上限。
 * 超活発なユーザーでも interval の短縮・cap の増加を 3 倍までに抑える。
 * cap は clamp(round(factor), 1, NOTIFY_DAILY_NORMAL_CAP_MAX) なので最大 3。
 */
export const NOTIFY_INTENSITY_MAX_FACTOR = 3;

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

/**
 * critical 通知に必要な Topic.Care の下限（リブトーク知識・記憶再設計 P5）。
 *
 * care は「ユーザー起点の fold」（SELF fact を伴う集約）でのみ上昇する（新規 Topic は 1、既存
 * Topic 更新・名寄せは +1）。キャラの自発リサーチ（WEB only の fold）では上がらないため、値が
 * 積み上がるのは集約バッチ稼働後かつユーザーが会話で触れた話題のみ。稼働直後は高 care Topic が
 * 存在せず critical 通知が発火しない（＝当面静穏）ことを許容する設計判断。要観測・要調整。
 * care 上昇ポリシーの詳細は consolidate.usecase.ts を参照。
 */
export const NOTIFY_CRITICAL_CARE_THRESHOLD = 3;

/**
 * クリティカル判定の「時限性あり」とみなすイベント日程の最大日数（今日から何日以内か）。
 *
 * LLM が抽出した eventDate が今日から NOTIFY_CRITICAL_EVENT_HORIZON_DAYS 日以内の未来である場合のみ
 * isUrgent=true とみなす。14 日を超える将来イベントや過去日は時限性なしとして除外する。
 */
export const NOTIFY_CRITICAL_EVENT_HORIZON_DAYS = 14;

// ---- セーフティ横断レビュー（ADR-2.22 / Issue #3580）----

/**
 * admin ステータス画面のセーフティ横断レビューで取得するデフォルト件数。
 * 最近の検出から降順で最大この件数を一覧表示する。
 */
export const SAFETY_REVIEW_DEFAULT_LIMIT = 50;

// ---- チャット API 保護ガード（Issue #3528）----

/**
 * レートリミット: 1 分ウィンドウの上限リクエスト数。
 */
export const CHAT_RATE_LIMIT_PER_MINUTE = 10;

/**
 * レートリミット: 1 時間ウィンドウの上限リクエスト数。
 */
export const CHAT_RATE_LIMIT_PER_HOUR = 100;

/**
 * in-flight ロックのデフォルト有効期間（ミリ秒）。
 *
 * これはクラッシュ/ハング時にロックを解放するための粗いフェイルセーフであり、
 * 上流の最大ストリーム時間（OpenAI SDK 既定の約 10 分）を上回る値にすることで
 * 進行中の正常ロックが並行リクエストに奪取されないようにする。
 * 正常時は finally の releaseLock で即時解放される。
 */
export const CHAT_LOCK_TTL_MS = 600_000;

// ---- Topic 中心モデル（リブトーク知識再設計 P1 / #3697、shadow build）----

/**
 * WEBRAW（Web 取得生データ）に付与する DynamoDB TTL（秒）。90 日後に自動削除。
 * 既存 Message の TTL（`MESSAGE_TTL_SECONDS`）と同じ値。
 */
export const WEBRAW_TTL_SECONDS = 90 * 24 * 60 * 60;

// ---- 集約（consolidation）バッチ（リブトーク知識再設計 P1 / #3697）----

/**
 * Topic 振り分けの近傍候補とみなす cosine similarity 下限閾値。
 * 粗いプレフィルタであり、最終的な merge（名寄せ）/ 新規作成の判断は LLM に委ねる。
 */
export const TOPIC_ROUTING_SIMILARITY_THRESHOLD = 0.4;

/**
 * Topic 振り分けでプロンプトに渡す候補 Topic の最大件数（プロンプト肥大の抑制）。
 */
export const TOPIC_ROUTING_MAX_CANDIDATES = 8;

/**
 * ルーティング用埋め込み（近傍候補算出）に使うテキストの最大文字数。
 * 直近の話題ほど関連性が高いため、末尾側を優先して切り詰める。
 */
export const CONSOLIDATION_ROUTING_TEXT_MAX_CHARS = 2000;

/**
 * WEB fact の揮発性区分ごとの再検証間隔（ミリ秒）（P3 の鮮度掃引バッチで使用予定）。
 * `stable` は再検証不要のため対象外（NextReview は常に undefined）。
 */
export const WEBFACT_REVIEW_INTERVAL_MS: Record<'low' | 'medium' | 'high', number> = {
  /** 低揮発性: 変化が乏しい情報のため月次程度の再検証で十分 */
  low: 30 * 24 * 60 * 60 * 1000,
  /** 中揮発性: 週次で再検証 */
  medium: 7 * 24 * 60 * 60 * 1000,
  /** 高揮発性: 変化が速い情報のため日次で再検証 */
  high: 1 * 24 * 60 * 60 * 1000,
};

// ---- acquire バッチ（リブトーク知識再設計 P3 / #3699）----

/**
 * acquire バッチ: 1 実行あたりに発行する Web 取得クエリの最大数（暴走防止）。
 * 依頼（StudyTopic）・鮮度切れ・care 自発リサーチの合算で消費する。
 */
export const ACQUIRE_MAX_QUERIES_PER_RUN = 3;

/**
 * acquire バッチ: 鮮度掃引（GSI-STALE の窓走査）で 1 回に取得する WEB fact の上限件数。
 * ページングの 1 ページ分の上限であり、`ACQUIRE_MAX_QUERIES_PER_RUN` と合わせて
 * 実際に再取得を実行する件数の上限を絞る。
 */
export const ACQUIRE_STALE_SWEEP_LIMIT = 10;

/**
 * acquire バッチ: care 自発リサーチのトピック単位クールダウン（ミリ秒）。
 *
 * care 上位 Topic を毎時・無条件に再取得すると、consolidation が WEB fact を
 * 重複除去しないため同一話題の冗長な WEB fact が線形増加する（本再設計が止めたい
 * 「同一話題 ×N」の再来）。直近この期間内に取得済み（最新 WEB fact の ObservedAt が
 * 新しい）Topic は自発リサーチをスキップし、未研究・古い Topic に集中させる。
 * 揮発 fact の鮮度追随は別途 GSI-STALE 経路が担うため、ここは「未取得ギャップの穴埋め」
 * に限定する。既定は 24 時間（要調整・要観測）。
 */
export const ACQUIRE_SELF_STUDY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * acquire バッチ: care 自発リサーチの候補として care 降順で読み込む Topic 数の上限。
 * クールダウン中の Topic を読み飛ばしても `ACQUIRE_MAX_QUERIES_PER_RUN` 分の
 * 研究対象を確保できるよう、budget より広めに候補を取る。
 */
export const ACQUIRE_SELF_STUDY_CANDIDATE_LIMIT = 20;

// ---- Topic 想起（関連度 only）（リブトーク知識再設計 P2 / #3698）----

/** 発話埋め込みと Topic 座標の cosine がこの値以上を想起候補とする（要調整・要観測）。 */
export const TOPIC_RECALL_SIMILARITY_THRESHOLD = 0.4;

/** 想起で注入する Topic の最大件数（閾値通過分の上位 K、要調整・要観測）。 */
export const TOPIC_RECALL_TOP_K = 5;

/** 1ホップ関連展開: 選抜 Topic の座標近傍とみなす Topic-Topic cosine 下限（direct より厳しめ、要調整・要観測）。 */
export const TOPIC_RECALL_RELATED_THRESHOLD = 0.8;

/** 1ホップ関連展開で追加する Topic の最大件数（暴発防止、要調整・要観測）。 */
export const TOPIC_RECALL_RELATED_MAX = 2;

// ---- 一回性マイグレーション（旧知識資材 → 新 Topic モデル、throwaway）----
//
// 手動発火バッチ専用の定数。移行完了・Issue クローズ後は関連コード一式
// （`migration/` ディレクトリ）ごと削除してよい。

/**
 * 擬似メッセージ・擬似 webraw の結合ストリームを consolidate() へ流し込む際の
 * 1 チャンクあたりの件数。実 topicRepo をチャンク間で共有し、後続チャンクが
 * 前チャンク生成の Topic に merge（名寄せ）できるようにする。
 */
export const MIGRATION_CHUNK_SIZE = 20;

/**
 * care シード: 1 Topic あたりに加算する care の上限（乱発防止）。
 * 正規化済みシグナル重みの合計を丸めた値をこの上限で cap する。
 */
export const MIGRATION_CARE_SEED_MAX_PER_TOPIC = 5;

/**
 * care シード: シグナル（InterestCategory / Memory）を Topic へ割り当てる際の
 * cosine similarity 下限閾値。これ未満なら Category 文字列一致にフォールバックする。
 */
export const MIGRATION_CARE_ASSIGN_SIMILARITY_THRESHOLD = 0.5;

/**
 * consolidate() の `selfFactProvenanceSuffix` に渡す固定文言。
 * 旧 Memory 由来の SELF fact の Provenance に「どこから移行されたか」を残す。
 */
export const MIGRATION_SELF_FACT_PROVENANCE_SUFFIX = '旧Memory移行';
