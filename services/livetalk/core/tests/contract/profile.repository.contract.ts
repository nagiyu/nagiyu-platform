/**
 * ProfileRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、
 * 実装間の乖離（GSI1射影・列挙の取りこぼしなど）を機械的に検知する。
 * 各テストは決定的で単一の結末を持ち（実行時分岐で結末を変えない・自己スキップしない）、
 * 形骸化テストは書かない。
 */

import type { ProfileRepository } from '../../src/repositories/profile.repository.interface.js';
import type { CreateProfileInput } from '../../src/entities/profile.entity.js';

/**
 * 契約テストの対象実装が満たすべきフック
 */
export interface ProfileRepositoryContractHooks {
  /** テスト対象のリポジトリを生成する（reset の後に呼ばれる） */
  makeRepository: () => Promise<ProfileRepository>;
  /** 各テスト前にストア／テーブルをクリーンな状態に戻す */
  reset: () => Promise<void>;
  /** 全テスト終了後の後始末（テーブル削除等） */
  teardown?: () => Promise<void>;
  /**
   * Profile 以外のエンティティ種別を同じテーブル／ストアに書き込む。
   * GSI1（Profile のみを索引化する sparse GSI）が Profile 以外を拾わないことを
   * 確認するために使う。
   */
  putNonProfileItem: (userId: string) => Promise<void>;
}

function buildProfileInput(overrides: Partial<CreateProfileInput> = {}): CreateProfileInput {
  return {
    UserID: 'user-001',
    ...overrides,
  };
}

/**
 * ProfileRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル（describe名に使用）
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineProfileRepositoryContract(
  label: string,
  hooks: ProfileRepositoryContractHooks
): void {
  describe(`ProfileRepository 契約: ${label}`, () => {
    let repository: ProfileRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    it('upsert で新規作成した内容が getById で取得でき、再 upsert の結果も反映される', async () => {
      const input = buildProfileInput();

      const created = await repository.upsert(input);
      expect(created.UserID).toBe(input.UserID);

      const fetched = await repository.getById({ userId: input.UserID });
      expect(fetched).toEqual(created);

      const updated = await repository.upsert(input, { LastActiveAt: created.LastActiveAt + 1 });
      expect(updated.CreatedAt).toBe(created.CreatedAt);
      expect(updated.LastActiveAt).toBe(created.LastActiveAt + 1);

      const fetchedAfterUpdate = await repository.getById({ userId: input.UserID });
      expect(fetchedAfterUpdate).toEqual(updated);
    });

    it('getById は未登録ユーザーに対して null を返す', async () => {
      expect(await repository.getById({ userId: 'no-such-user' })).toBeNull();
    });

    it('listAllUserIds は sparse GSI1 により Profile 以外のエンティティを含めない', async () => {
      await repository.upsert(buildProfileInput({ UserID: 'profile-user' }));
      await hooks.putNonProfileItem('non-profile-user');

      const result = await repository.listAllUserIds();

      expect(result).toEqual(['profile-user']);
    });

    it('listAllUserIds は100件超のユーザーでも取りこぼさず全件返す', async () => {
      const userCount = 150;
      const expectedUserIds = Array.from(
        { length: userCount },
        (_, i) => `user-${String(i).padStart(4, '0')}`
      );
      for (const userId of expectedUserIds) {
        await repository.upsert(buildProfileInput({ UserID: userId }));
      }

      const result = await repository.listAllUserIds();

      expect(result.sort()).toEqual(expectedUserIds.sort());
    });
  });
}
