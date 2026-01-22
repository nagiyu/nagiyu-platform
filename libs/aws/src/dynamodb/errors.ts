/**
 * DynamoDB Repository 共通エラークラス
 *
 * DynamoDBリポジトリで使用する共通のエラークラスを提供
 */

// エラーメッセージ定数
const ERROR_MESSAGES = {
  ENTITY_NOT_FOUND: 'エンティティが見つかりません',
  ENTITY_ALREADY_EXISTS: 'エンティティは既に存在します',
  INVALID_ENTITY_DATA: 'エンティティデータが無効です',
  DATABASE_ERROR: 'データベースエラーが発生しました',
} as const;

/**
 * リポジトリエラー基底クラス
 */
export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

/**
 * エンティティが見つからない場合のエラー
 */
export class EntityNotFoundError extends RepositoryError {
  constructor(entityType: string, identifier: string) {
    super(`${ERROR_MESSAGES.ENTITY_NOT_FOUND}: ${entityType}=${identifier}`);
    this.name = 'EntityNotFoundError';
  }
}

/**
 * エンティティが既に存在する場合のエラー
 */
export class EntityAlreadyExistsError extends RepositoryError {
  constructor(entityType: string, identifier: string) {
    super(`${ERROR_MESSAGES.ENTITY_ALREADY_EXISTS}: ${entityType}=${identifier}`);
    this.name = 'EntityAlreadyExistsError';
  }
}

/**
 * エンティティデータが無効な場合のエラー
 */
export class InvalidEntityDataError extends RepositoryError {
  constructor(message: string) {
    super(`${ERROR_MESSAGES.INVALID_ENTITY_DATA}: ${message}`);
    this.name = 'InvalidEntityDataError';
  }
}

/**
 * データベース操作でエラーが発生した場合のエラー
 */
export class DatabaseError extends RepositoryError {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(`${ERROR_MESSAGES.DATABASE_ERROR}: ${message}`);
    this.name = 'DatabaseError';
  }
}
