import { EntityNotFoundError, OptimisticLockError } from '@nagiyu/aws';
import type { User } from '@nagiyu/common';
import { ROLES_AND_GRANTS_MAX_ATTEMPTS, type RolesAndGrantsChange } from './user-repository';

/**
 * 楽観ロック付きの「読んで、計算して、書く」を、競合時にやり直しながら行う。
 *
 * DynamoDB 版と InMemory 版で同じやり直しの振る舞いにするため、保存方法だけを引数で受ける。
 *
 * @param read - ユーザーを読む。いなければ null
 * @param write - 読んだ `updatedAt` を条件にして書く
 */
export async function updateRolesAndGrantsWithRetry(
  userId: string,
  compute: (user: User) => RolesAndGrantsChange,
  read: (userId: string) => Promise<User | null>,
  write: (userId: string, change: RolesAndGrantsChange, expectedUpdatedAt: number) => Promise<User>
): Promise<User> {
  let lastError: OptimisticLockError | undefined;

  for (let attempt = 0; attempt < ROLES_AND_GRANTS_MAX_ATTEMPTS; attempt++) {
    const user = await read(userId);
    if (!user) {
      throw new EntityNotFoundError('User', userId);
    }

    const change = compute(user);
    try {
      return await write(userId, change, user.updatedAt);
    } catch (error) {
      if (error instanceof OptimisticLockError) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError as OptimisticLockError;
}
