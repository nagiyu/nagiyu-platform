/**
 * NiconicoMylistAssistant Core - Video Entity
 *
 * 動画基本情報のビジネスオブジェクト（PK/SKを持たない純粋なエンティティ）
 */

/**
 * 動画エンティティ
 *
 * DynamoDBの実装詳細（PK/SK）を含まない純粋なビジネスオブジェクト
 */
export interface VideoEntity {
  /** 動画ID */
  videoId: string;
  /** タイトル */
  title: string;
  /** サムネイルURL */
  thumbnailUrl: string;
  /** 長さ（MM:SS形式） */
  length: string;
  /** 作成日時 (ISO 8601) */
  createdAt: string;
  /** 動画更新日時 (ISO 8601, オプション) */
  videoUpdatedAt?: string;
}

/**
 * Video作成時の入力データ（createdAtを含まない）
 */
export type CreateVideoInput = Omit<VideoEntity, 'createdAt'>;

/**
 * Videoのビジネスキー
 */
export interface VideoKey {
  videoId: string;
}
