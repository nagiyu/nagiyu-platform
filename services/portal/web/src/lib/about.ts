/**
 * About ページで使用するデータ定数
 *
 * 運営者情報・タイムライン・運営方針など、About ページに表示する
 * すべての静的データをここで管理する。
 * コンテキスト外のデータを記載しないこと（捏造禁止）。
 */

export const ERROR_MESSAGES = {
  ABOUT_DATA_NOT_FOUND: 'Aboutページのデータが見つかりません',
} as const;

/**
 * 主要スキル・専門領域
 * package.json およびリポジトリのコードから確認できる技術のみ記載
 */
export type Skill = {
  /** スキル名 */
  label: string;
  /** 分類カテゴリ */
  category: 'フロントエンド' | 'バックエンド' | 'インフラ' | 'ツール・その他';
};

export const SKILLS: Skill[] = [
  { label: 'Next.js', category: 'フロントエンド' },
  { label: 'TypeScript', category: 'フロントエンド' },
  { label: 'React', category: 'フロントエンド' },
  { label: 'Material-UI (MUI)', category: 'フロントエンド' },
  { label: 'AWS Lambda', category: 'インフラ' },
  { label: 'AWS ECS / Fargate', category: 'インフラ' },
  { label: 'AWS CloudFront', category: 'インフラ' },
  { label: 'AWS Batch', category: 'インフラ' },
  { label: 'AWS CDK', category: 'インフラ' },
  { label: 'Docker', category: 'バックエンド' },
  { label: 'GitHub Actions', category: 'ツール・その他' },
  { label: 'Jest / Playwright', category: 'ツール・その他' },
] as const;

/**
 * タイムラインイベント
 * git log および services/ ディレクトリ等から確認できる事実のみ記載
 */
export type TimelineEvent = {
  /** 表示する期間・時点（例: "2026年5月"） */
  period: string;
  /** イベントの見出し */
  title: string;
  /** 詳細説明（省略可） */
  description?: string;
};

/**
 * プラットフォームの主要マイルストーン
 *
 * git log --reverse --pretty=format:"%ai" | head -1 の結果
 *   → 2026-05-04 11:36:00 +0900（リポジトリ初コミット）
 * ※ 技術記事の執筆はリポジトリ作成前から行われており、
 *    publishedAt が 2026年3月〜4月の記事はリポジトリ公開前の執筆分を含む
 */
export const TIMELINE_EVENTS: TimelineEvent[] = [
  {
    period: '2026年初頭〜',
    title: '技術記事の執筆を開始',
    description:
      'AWS・TypeScript・Next.js などの実装経験をもとに技術記事の執筆を開始。モノレポ構成・EventBridge・DynamoDB 単一テーブル設計など、実際に手を動かして得た知見を記録し始めた。',
  },
  {
    period: '2026年5月',
    title: 'nagiyu-platform リポジトリを作成',
    description:
      'AWS・Next.js を中心としたモノレポ構成のプラットフォーム「nagiyu-platform」を立ち上げ、複数の個人開発プロダクトを設計・実装・運用する基盤を整えた。いずれも私自身が設計から運用までを担当しており、ここで実際に手を動かして得た知見が技術記事の一次情報の源泉になっている。',
  },
  {
    period: '2026年6月〜',
    title: 'AdSense 申請に向けてコンテンツを拡充',
    description:
      '実装経験をもとにした技術記事を 20 本以上公開。AWS アーキテクチャ・Next.js・TypeScript などをテーマに、一次情報に基づく解説を継続して公開している。',
  },
] as const;

/**
 * 対象読者の定義
 */
export const TARGET_READERS: string[] = [
  'AWS × Next.js のフルスタック構成を検討しているエンジニア',
  '個人開発でプロダクトを設計・運用してみたい方',
  'クラウドインフラ・アプリケーション設計の意思決定過程に興味がある方',
  '実装の「なぜそう設計したか」を運用視点で知りたい方',
] as const;

/**
 * 運営方針の各項目
 */
export type PolicyItem = {
  /** 方針の見出し */
  title: string;
  /** 詳細説明 */
  description: string;
};

export const POLICY_ITEMS: PolicyItem[] = [
  {
    title: '一次情報に基づく執筆',
    description:
      '技術記事はすべて、私が実際に nagiyu-platform で実装・運用した経験をもとに執筆しています。検証していない手法や未経験の構成は記事化しません。',
  },
  {
    title: '継続的な更新',
    description:
      'ライブラリのバージョンアップや仕様変更で内容が古くなった場合は、フロントマターの更新日時を明示したうえで本文を改訂します。情報の鮮度を意識して運用しています。',
  },
  {
    title: '設計意図と運用視点の記録',
    description:
      '「動く」コードを書くだけでなく、なぜそう設計したか・運用してみてどうだったかという視点を記録することを重視しています。同じ課題に取り組む方の判断材料になることを目指しています。',
  },
  {
    title: '広告と編集の分離',
    description:
      '収益化は Google AdSense のみを使用しています。広告配信は記事内容と独立しており、広告主から編集への介入は受けません。',
  },
  {
    title: 'AI 補助の透明性',
    description:
      '文章作成の補助に生成 AI を活用することがありますが、技術的な内容は必ず自身で実装・動作確認したうえで公開します。AI が生成した内容を無検証で掲載することはありません。',
  },
] as const;
