import { EntityNotFoundError, OptimisticLockError } from '@nagiyu/aws';
import type { User } from '@nagiyu/common';
import { ROLES_AND_GRANTS_MAX_ATTEMPTS, type RolesAndGrantsChange } from './user-repository';

/**
 * 楽観ロック付きの「読んで、計算して、書く」を、競合時にやり直しながら行う。
 *
 * DynamoDB 版と InMemory 版で同じやり直しの振る舞いにするため、保存方法だけを引数で受ける。
 *
 * 旧形式の項目は `UpdatedAt` が数値で保存されていない (旧名の属性や ISO 文字列)。条件は保存値そのものと
 * 比べるため、そのままでは何度読み直しても一致しない。競合したら、中身を変えずに `UpdatedAt` だけを
 * 今の形で書き直してから読み直す。中身は変えないので、同時に書いた側の変更は失われない。
 *
 * @param read - ユーザーを読む。いなければ null
 * @param write - 読んだ `updatedAt` を条件にして書く
 * @param touch - 中身を変えずに `UpdatedAt` だけを今の形で書き直す
 */
export async function updateRolesAndGrantsWithRetry(
  userId: string,
  compute: (user: User) => RolesAndGrantsChange,
  read: (userId: string) => Promise<User | null>,
  write: (userId: string, change: RolesAndGrantsChange, expectedUpdatedAt: number) => Promise<User>,
  touch: (userId: string) => Promise<void>
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
        if (attempt < ROLES_AND_GRANTS_MAX_ATTEMPTS - 1) {
          await touch(userId);
        }
        continue;
      }
      throw error;
    }
  }

  throw lastError as OptimisticLockError;
}

/**
 * 指定した `expectedUpdatedAt` を条件に 1 回だけ書き、競合したら `UpdatedAt` を今の形に直してから投げ直す。
 *
 * 旧形式の項目は条件が一致しないため、直さないと呼び出し側が読み直しても永遠に競合する。
 *
 * @param write - `expectedUpdatedAt` を条件にして書く
 * @param touch - 中身を変えずに `UpdatedAt` だけを今の形で書き直す
 */
export async function writeOnceRefreshingOnConflict(
  userId: string,
  write: () => Promise<User>,
  touch: (userId: string) => Promise<void>
): Promise<User> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof OptimisticLockError) {
      await touch(userId);
    }
    throw error;
  }
}
