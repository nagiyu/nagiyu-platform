/**
 * SafetyEventRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、
 * 実装間の乖離（GSI2射影・ソート順など）を機械的に検知する。
 * 各テストは決定的で単一の結末を持ち（実行時分岐で結末を変えない・自己スキップしない）、
 * 形骸化テストは書かない。
 */

import type { SafetyEventRepository } from '../../src/repositories/safety-event.repository.interface.js';
import type { CreateSafetyEventInput } from '../../src/entities/safety-event.entity.js';
import { defaultUlidFactory } from '../../src/lib/ulid.js';

/**
 * 契約テストの対象実装が満たすべきフック
 */
export interface SafetyEventRepositoryContractHooks {
  /** テスト対象のリポジトリを生成する（reset の後に呼ばれる） */
  makeRepository: () => Promise<SafetyEventRepository>;
  /** 各テスト前にストア／テーブルをクリーンな状態に戻す */
  reset: () => Promise<void>;
  /** 全テスト終了後の後始末（テーブル削除等） */
  teardown?: () => Promise<void>;
}

function buildSafetyEventInput(
  overrides: Partial<CreateSafetyEventInput> = {}
): CreateSafetyEventInput {
  return {
    UserID: 'user-001',
    CharacterID: 'hiyori',
    Trigger: 'input_keyword',
    DetectedPattern: '[自殺念慮] 死にたい',
    InputText: '死にたい',
    ResponseText: 'ねえ、今すごく心配しちゃった…',
    ...overrides,
  };
}

/**
 * 固定時刻から一定間隔で単調増加する実 ULID を、同じ seq に対しては常に同じ文字列で返す。
 * ULID は先頭の時刻成分が下位のランダム成分より優先してソートされるため、
 * 種となる時刻を seq ごとに厳密に増やせば、時刻成分だけで辞書順が確定し、
 * 実行のたびに順序が変わることはない（本番の EventID 採番経路と同じ `defaultUlidFactory` を使う）。
 * ただし `defaultUlidFactory` はランダム成分を毎回振り直すため、同一テスト内で
 * 同じ seq を「作成時」と「期待値の組み立て」の両方で参照できるよう、seq ごとに1回だけ
 * 生成してメモ化する（メモ化しないと呼び出しごとに異なる文字列になり、テストが必ず失敗する）。
 */
const ULID_BASE_TIME_MS = 1_700_000_000_000;
const ulidCache = new Map<number, string>();
function ulidAt(seq: number): string {
  const cached = ulidCache.get(seq);
  if (cached !== undefined) {
    return cached;
  }
  const generated = defaultUlidFactory(ULID_BASE_TIME_MS + seq * 1_000);
  ulidCache.set(seq, generated);
  return generated;
}

/**
 * SafetyEventRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル（describe名に使用）
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineSafetyEventRepositoryContract(
  label: string,
  hooks: SafetyEventRepositoryContractHooks
): void {
  describe(`SafetyEventRepository 契約: ${label}`, () => {
    let repository: SafetyEventRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    it('create したデータを getById で取得できる', async () => {
      const input = buildSafetyEventInput({ EventID: ulidAt(1) });

      const created = await repository.create(input);
      expect(created).toMatchObject(input);
      expect(created.CreatedAt).toBeGreaterThan(0);

      const fetched = await repository.getById({
        userId: created.UserID,
        eventId: created.EventID,
      });
      expect(fetched).toEqual(created);
    });

    it('EventID を明示指定しない場合、ULID が自動採番されgetByIdで取得できる', async () => {
      // makeRepository はデフォルト引数（defaultUlidFactory）でリポジトリを生成するため、
      // 本番と同じ ULID 自動採番経路を通す。
      const created = await repository.create(buildSafetyEventInput());

      // ULID（Crockford Base32、26文字）の形式であることを確認する
      expect(created.EventID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

      const fetched = await repository.getById({
        userId: created.UserID,
        eventId: created.EventID,
      });
      expect(fetched).toEqual(created);
    });

    it('getById は未登録イベントに対して null を返す', async () => {
      expect(
        await repository.getById({ userId: 'no-such-user', eventId: 'no-such-event' })
      ).toBeNull();
    });

    it('listRecent は EventID（ULID）降順で返す（挿入順ではない）', async () => {
      // 意図的に非ソート順（3→1→2）で作成する
      await repository.create(buildSafetyEventInput({ UserID: 'u-a', EventID: ulidAt(3) }));
      await repository.create(buildSafetyEventInput({ UserID: 'u-b', EventID: ulidAt(1) }));
      await repository.create(buildSafetyEventInput({ UserID: 'u-c', EventID: ulidAt(2) }));

      const result = await repository.listRecent(10);

      expect(result.map((r) => r.EventID)).toEqual([ulidAt(3), ulidAt(2), ulidAt(1)]);
    });

    it('listRecent は limit で件数を絞り、最近（EventID降順で先頭）のものを返す', async () => {
      for (let i = 1; i <= 5; i += 1) {
        await repository.create(buildSafetyEventInput({ UserID: `u-${i}`, EventID: ulidAt(i) }));
      }

      const result = await repository.listRecent(2);

      expect(result.map((r) => r.EventID)).toEqual([ulidAt(5), ulidAt(4)]);
    });

    it('listRecent は100件超のイベントでも最近の検出を取りこぼさない', async () => {
      const total = 150;
      for (let i = 1; i <= total; i += 1) {
        await repository.create(buildSafetyEventInput({ UserID: `u-${i}`, EventID: ulidAt(i) }));
      }

      const result = await repository.listRecent(50);

      const expectedEventIds = Array.from({ length: 50 }, (_, i) => ulidAt(total - i));
      expect(result.map((r) => r.EventID)).toEqual(expectedEventIds);
    });

    it('listRecent が返すサマリーに InputText / ResponseText（PII）が含まれない', async () => {
      // 保証範囲の注記: このテストは SafetyEventMapper.toSummary が InputText/ResponseText を
      // 読み落とすことを確認しているのであって、GSI2 の射影自体が InputText/ResponseText を
      // 除外していることまでは保証しない（射影の担保は table-schema-drift.test.ts が
      // 別途行っている）。toSummary が誤ってこれらのフィールドを読むよう変更されても、
      // 射影が InputText/ResponseText を含むように変更されない限りはこのテストだけでは検知できない。
      await repository.create(
        buildSafetyEventInput({
          EventID: ulidAt(1),
          InputText: '極めて機微な入力テキスト',
          ResponseText: '極めて機微な応答テキスト',
        })
      );

      const [summary] = await repository.listRecent(10);

      expect(summary).toBeDefined();
      expect(Object.keys(summary as object)).not.toContain('InputText');
      expect(Object.keys(summary as object)).not.toContain('ResponseText');
    });

    it('同じUserID/EventIDでcreateを重複させるとEntityAlreadyExistsErrorをスローする', async () => {
      const input = buildSafetyEventInput({ EventID: ulidAt(1) });
      await repository.create(input);

      await expect(repository.create(input)).rejects.toThrow(
        expect.objectContaining({ name: 'EntityAlreadyExistsError' })
      );
    });
  });
}
