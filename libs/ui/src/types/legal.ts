/**
 * 規約・プライバシーポリシーで共通に使う文書構造。
 * 条文ごとの本文・番号付きリスト・リンクを 1 つの形式で表すことで、
 * 描画部品とデータ定義をサービス間で共有する。
 */

/** 番号付きリストの 1 項目。さらに下位の項目を持てる */
export interface LegalSubContent {
  subContent: string;
  subItems?: string[];
}

/** 条の中の 1 段落 */
export interface LegalContent {
  mainContent: string;
  subContents?: LegalSubContent[];
  link?: string;
}

/** 1 つの条。条番号は配列の並び順から採番する */
export interface LegalSection {
  title: string;
  contents: LegalContent[];
}

/** 特定商取引法に基づく表記の 1 行 */
export interface CommercialTransactionItem {
  /** 項目名 */
  label: string;
  /** 内容 */
  value: string;
  /**
   * リンクにする種類。
   * 'mailto' は内容全体をメールアドレスのリンクにし、'plans' は linkText の部分だけを料金ページへのリンクにする
   */
  linkKind?: 'mailto' | 'plans';
  /** linkKind が 'plans' のとき、内容の中でリンクにする語 */
  linkText?: string;
}
