/**
 * ページネーションオプション
 */
export interface PaginationOptions {
  /** 取得する最大件数 */
  limit?: number;
  /** 次のページのカーソル（不透明トークン） */
  cursor?: string;
}

/**
 * ページネーション結果
 */
export interface PaginatedResult<T> {
  /** データの配列 */
  items: T[];
  /** 次のページがある場合のカーソル（不透明トークン） */
  nextCursor?: string;
  /** 総件数（取得可能な場合） */
  count?: number;
}
