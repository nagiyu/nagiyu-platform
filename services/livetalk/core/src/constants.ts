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
 * care は新規 Topic 作成時に 1、consolidation での既存 Topic 更新（名寄せ）時に +1 されるため、
 * 集約バッチ稼働後にしか値が積み上がらない。稼働直後は高 care Topic が存在せず critical 通知が
 * 発火しない（＝当面静穏）ことを許容する設計判断。要観測・要調整。
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
