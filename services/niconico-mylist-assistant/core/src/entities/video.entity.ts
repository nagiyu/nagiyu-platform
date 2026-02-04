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
  /** 作成日時 (Unix timestamp) */
  CreatedAt: number;
  /** 動画更新日時 (Unix timestamp, オプション) */
  videoUpdatedAt?: number;
}

/**
 * Video作成時の入力データ（CreatedAtを含まない）
 */
export type CreateVideoInput = Omit<VideoEntity, 'CreatedAt'>;

/**
 * Videoのビジネスキー
 */
export interface VideoKey {
  videoId: string;
}
