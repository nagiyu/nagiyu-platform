import { toDatabaseError } from '@nagiyu/aws';

/**
 * DynamoDB SDK 呼び出しの例外を DatabaseError に包む。
 * 業務エラー (見つからない等) は RepositoryError 派生ではなく、web 側がメッセージ文字列で判定しているため、
 * 包む範囲は SDK 呼び出しだけに限定し、業務エラーの throw をこの関数の内側に入れない。
 */
export async function withDatabaseError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    throw toDatabaseError(error);
  }
}
