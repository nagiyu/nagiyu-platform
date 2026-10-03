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
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(`${ERROR_MESSAGES.DATABASE_ERROR}: ${message}`);
    this.cause = cause;
    this.name = 'DatabaseError';
  }
}

/**
 * ConditionalCheckFailedException かどうかを判定する。
 * SDK の例外クラスが重複インスタンス化されると instanceof が失敗するため、
 * Error 以外のオブジェクトも含めて name で判定する。
 */
export function isConditionalCheckFailed(
  error: unknown
): error is { name: 'ConditionalCheckFailedException' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'ConditionalCheckFailedException'
  );
}

/**
 * 任意のエラーを RepositoryError に正規化する。
 * 既に RepositoryError ならメッセージが二重に包まれないようそのまま返し、
 * 各リポジトリの catch での DatabaseError ラップを `throw toDatabaseError(error)` に集約する。
 */
export function toDatabaseError(error: unknown): RepositoryError {
  if (error instanceof RepositoryError) {
    return error;
  }
  if (error instanceof Error) {
    return new DatabaseError(error.message, error);
  }
  return new DatabaseError(String(error));
}

/**
 * DynamoDB の ConditionalCheckFailedException を Entity 例外にマッピングするヘルパー。
 * `onExists` は conditional put（存在チェック）失敗時、`onMissing` は conditional update/delete
 * （不在チェック）失敗時に呼ぶコールバックを渡す。
 * ConditionalCheckFailedException 以外のエラーは無視し、呼び出し元で再スローする。
 */
export function mapConditionalCheckFailed(
  error: unknown,
  callbacks: {
    onExists?: () => never;
    onMissing?: () => never;
  }
): void {
  if (isConditionalCheckFailed(error)) {
    if (callbacks.onExists) {
      callbacks.onExists();
    } else if (callbacks.onMissing) {
      callbacks.onMissing();
    }
  }
}
