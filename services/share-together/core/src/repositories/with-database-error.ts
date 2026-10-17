import { toDatabaseError } from '@nagiyu/aws';

/**
 * DynamoDB SDK 呼び出しの例外を DatabaseError に包む。
 * EntityStore を通らない独自の Query や一括削除だけがこの関数を使う。
 * EntityNotFoundError などの RepositoryError 派生は呼び出し側が instanceof で判定するため、
 * 包む範囲は SDK 呼び出しだけに限定し、それらの throw をこの関数の内側に入れない。
 */
export async function withDatabaseError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    throw toDatabaseError(error);
  }
}
