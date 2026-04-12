/**
 * ハイライトテーブルの列定義
 *
 * - fixed: true の列は常時表示であり、非表示に切り替えることができない
 * - defaultVisible: 初回表示時のデフォルト表示状態
 */

export type ColumnDefinition = {
  /** テーブル列を一意に識別するキー */
  readonly id: string;
  /** テーブルヘッダーに表示するラベル文字列 */
  readonly label: string;
  /** true の場合は常時表示であり、ユーザーが非表示に切り替えることができない */
  readonly fixed: boolean;
  /** 初回表示時のデフォルト表示状態。true: 表示、false: 非表示 */
  readonly defaultVisible: boolean;
};

export const HIGHLIGHT_TABLE_COLUMNS: readonly ColumnDefinition[] = [
  {
    id: 'order',
    label: 'No.',
    fixed: true,
    defaultVisible: true,
  },
  {
    id: 'time',
    label: '開始〜終了(秒)',
    fixed: true,
    defaultVisible: true,
  },
  {
    id: 'status',
    label: '採否',
    fixed: true,
    defaultVisible: true,
  },
  {
    id: 'source',
    label: '抽出根拠',
    fixed: false,
    defaultVisible: false,
  },
] as const;
