/**
 * AlertRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、
 * 実装間の乖離（既定ページサイズ・ソート順・nextCursorの境界・FilterExpressionの挙動など）を
 * 機械的に検知する。各テストは決定的で単一の結末を持ち（実行時分岐で結末を変えない・
 * 自己スキップしない）、形骸化テストは書かない。
 *
 * getByFrequency / getTemporaryCandidatesByFrequency は GSI2（AlertIndex）に対する
 * 正攻法のQueryのため、順序（GSI2SK=`${UserID}#${AlertID}`昇順）をassertする。
 *
 * getByFrequency にはTTLフィルタの契約を書かない（実装のKeyConditionExpressionは
 * `#gsi2pk = :pk` のみでFilterExpressionが無いため。getByUserIdとは異なる）。
 *
 * getByFrequency は「全件を返す」契約（#3801でページネーション付き口を廃止）。
 * 実DynamoDB実装はページ境界が1MB単位のため、フィクスチャの件数ではページ分割は
 * 起きない（複数ページ走査はDynamoDB実装の単体テストでLastEvaluatedKeyループを担保する）。
 * この契約テストでは境界（50件ちょうど・51件・130件）で全件・順序どおり返ることのみを
 * 検証する。
 *
 * `PaginatedResult.count` は契約対象外（#3802で別途検討）。型定義上は「総件数」だが、
 * getTemporaryCandidatesByFrequency等ではInMemoryが総件数・DynamoDBがページ件数を返すなど
 * 実装間でセマンティクスが食い違っている。共有型の意味を決め直す話のため、この契約テストの
 * 範囲では揃えず・assertもしない（検証し忘れではなく意図的な対象外）。
 *
 * 末尾の TemporaryAlertCandidate 射影テストは例外的に「乖離検知テスト」ではない
 * （ProjectionExpressionとAlertMapper.toTemporaryCandidateが読む属性が現状ちょうど
 * 一致しているため両実装とも通る。将来属性が増えたときの退行ガード。詳細はテスト
 * 直前のコメント参照）。
 */

import type { AlertRepository } from '../../src/repositories/alert.repository.interface.js';
import type { CreateAlertInput } from '../../src/entities/alert.entity.js';

/**
 * 契約テストの対象実装が満たすべきフック
 */
export interface AlertRepositoryContractHooks {
  /** テスト対象のリポジトリを生成する（reset の後に呼ばれる） */
  makeRepository: () => Promise<AlertRepository>;
  /** 各テスト前にストア／テーブルをクリーンな状態に戻す */
  reset: () => Promise<void>;
  /** 全テスト終了後の後始末（テーブル削除等） */
  teardown?: () => Promise<void>;
}

function buildAlertInput(overrides: Partial<CreateAlertInput> = {}): CreateAlertInput {
  return {
    UserID: 'user-1',
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Mode: 'Buy',
    Frequency: 'MINUTE_LEVEL',
    Enabled: true,
    ConditionList: [{ field: 'price', operator: 'gte', value: 100 }],
    subscription: {
      endpoint: 'https://push.example.com/endpoint',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    },
    ...overrides,
  };
}

/** ゼロ埋めした4桁連番のUserIDを返す（GSI2SKの昇順を文字列比較で確定させるため） */
function paddedUserId(index: number): string {
  return `U${String(index).padStart(4, '0')}`;
}

/**
 * AlertRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル（describe名に使用）
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineAlertRepositoryContract(
  label: string,
  hooks: AlertRepositoryContractHooks
): void {
  describe(`AlertRepository 契約: ${label}`, () => {
    let repository: AlertRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    it('create したデータを getById で取得でき、update・delete の結果も反映される', async () => {
      const input = buildAlertInput();

      const created = await repository.create(input);
      expect(created).toMatchObject(input);
      expect(created.AlertID).toBeTruthy();

      const fetched = await repository.getById(created.UserID, created.AlertID);
      expect(fetched).toEqual(created);

      const updated = await repository.update(created.UserID, created.AlertID, {
        Enabled: false,
      });
      expect(updated.Enabled).toBe(false);

      await repository.delete(created.UserID, created.AlertID);
      const afterDelete = await repository.getById(created.UserID, created.AlertID);
      expect(afterDelete).toBeNull();
    });

    it('getById は未登録のアラートに対してnullを返す', async () => {
      expect(await repository.getById('no-such-user', 'no-such-alert')).toBeNull();
    });

    it('存在しない対象へのupdateはEntityNotFoundErrorをスローする', async () => {
      await expect(
        repository.update('no-such-user', 'no-such-alert', { Enabled: false })
      ).rejects.toThrow(expect.objectContaining({ name: 'EntityNotFoundError' }));
    });

    it('存在しない対象へのdeleteはEntityNotFoundErrorをスローする', async () => {
      await expect(repository.delete('no-such-user', 'no-such-alert')).rejects.toThrow(
        expect.objectContaining({ name: 'EntityNotFoundError' })
      );
    });

    it('存在しない対象へのmarkTemporaryAsExpiredはEntityNotFoundErrorをスローする', async () => {
      await expect(
        repository.markTemporaryAsExpired('no-such-user', 'no-such-alert', 0)
      ).rejects.toThrow(expect.objectContaining({ name: 'EntityNotFoundError' }));
    });

    it('getByUserIdはmarkTemporaryAsExpired済み（TTL設定済み）のアラートを除外する', async () => {
      // DynamoDB LocalはTTLの実削除を再現しない（属性は保存されるが期限到来で消えない）ため、
      // ここでは「TTL属性が付与された時点でgetByUserIdの結果から除外される」ことのみを検証し、
      // 実際にアイテムが物理削除されることまでは検証しない（対象外）。
      const userId = 'user-ttl';
      const kept = await repository.create(buildAlertInput({ UserID: userId, Temporary: false }));
      const expiring = await repository.create(
        buildAlertInput({
          UserID: userId,
          Temporary: true,
          TemporaryExpireDate: '2024-01-02',
        })
      );

      await repository.markTemporaryAsExpired(
        expiring.UserID,
        expiring.AlertID,
        Math.floor(Date.now() / 1000)
      );

      const result = await repository.getByUserId(userId);

      expect(result.items.map((item) => item.AlertID)).toEqual([kept.AlertID]);
    });

    it('getByUserIdはoptions未指定時、既定で50件に制限される（実DynamoDB実装の既定limit=50との乖離防止）', async () => {
      // 実DynamoDB実装（dynamodb-alert.repository.ts）は options?.limit || 50 のため、
      // limit未指定時は50件で打ち切られnextCursorが付く。130件（>100かつ>50）投入し、
      // 両実装ともstore既定の100件ではなく50件で揃うことを検証する。
      const userId = 'user-bulk';
      const total = 130;
      for (let i = 0; i < total; i += 1) {
        await repository.create(buildAlertInput({ UserID: userId }));
      }

      const result = await repository.getByUserId(userId);

      expect(result.items).toHaveLength(50);
      expect(result.nextCursor).toBeDefined();
    });

    it('getByFrequencyは指定頻度のアラートだけを返す（GSI2パーティション分離）', async () => {
      await repository.create(buildAlertInput({ UserID: 'user-a', Frequency: 'MINUTE_LEVEL' }));
      await repository.create(buildAlertInput({ UserID: 'user-b', Frequency: 'MINUTE_LEVEL' }));
      await repository.create(buildAlertInput({ UserID: 'user-c', Frequency: 'HOURLY_LEVEL' }));

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result).toHaveLength(2);
      expect(result.every((item) => item.Frequency === 'MINUTE_LEVEL')).toBe(true);
    });

    it('getByFrequencyは挿入順ではなくソートキー（GSI2SK=UserID#AlertID）のUserID昇順で返す', async () => {
      // 意図的に降順（U0009→…→U0000）に作成する。件数を10件にしているのは、件数が
      // 少ないと退行時（ソートキー未指定でベーステーブルのSK=ALERT#{AlertID}、
      // すなわちランダムなUUID順にフォールバックする状態）でも偶然ソート済みの結果が
      // 返り、spurious passになり得るため（3件では1/6の確率で偶然通ってしまうことを
      // 実測済み）。10件では偶然一致する確率は1/10!であり、退行時は事実上確実に失敗する。
      // UserIDをゼロ埋めで一意にすることで、GSI2SK（`${UserID}#${AlertID}`。AlertIDは
      // UUIDのため制御不可）の大小関係をUserID側で確定させる（UserIDのprefixが異なる限り、
      // 後続のAlertIDの値は比較結果に影響しない）。
      const total = 10;
      for (let i = total - 1; i >= 0; i -= 1) {
        await repository.create(
          buildAlertInput({ UserID: paddedUserId(i), Frequency: 'MINUTE_LEVEL' })
        );
      }

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      const expected = Array.from({ length: total }, (_, i) => paddedUserId(i));
      expect(result.map((item) => item.UserID)).toEqual(expected);
    });

    it('getByFrequencyは同一UserID内ではAlertIDの昇順で返す（GSI2SKの第2段階の順序契約）', async () => {
      // AlertIDはUUID（create()内でrandomUUIDにより生成）のため値を指定できない。
      // そのため「作成した5件のAlertIDを独立にソートした配列」をexpectedとして先に計算し、
      // 実際のクエリ結果の順序と突き合わせる（result.items自体をソートして自分自身と
      // 比較するような自己言及的な検証にはしない）。
      const userId = 'user-same-partition';
      const created = [];
      for (let i = 0; i < 5; i += 1) {
        created.push(
          await repository.create(buildAlertInput({ UserID: userId, Frequency: 'MINUTE_LEVEL' }))
        );
      }

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      const expectedAlertIdOrder = created
        .map((alert) => alert.AlertID)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      expect(result.map((item) => item.AlertID)).toEqual(expectedAlertIdOrder);
    });

    it('getByFrequencyはちょうど50件（旧既定limitの境界）でも打ち切られず全件返る', async () => {
      const total = 50;
      for (let i = 0; i < total; i += 1) {
        await repository.create(
          buildAlertInput({ UserID: paddedUserId(i), Frequency: 'MINUTE_LEVEL' })
        );
      }

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result).toHaveLength(total);
      const expected = Array.from({ length: total }, (_, i) => paddedUserId(i));
      expect(result.map((item) => item.UserID)).toEqual(expected);
    });

    it('getByFrequencyは51件（旧既定limitの境界+1）でも打ち切られず全件返る（Issue #3801の主眼）', async () => {
      const total = 51;
      for (let i = 0; i < total; i += 1) {
        await repository.create(
          buildAlertInput({ UserID: paddedUserId(i), Frequency: 'MINUTE_LEVEL' })
        );
      }

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      expect(result).toHaveLength(total);
      const expected = Array.from({ length: total }, (_, i) => paddedUserId(i));
      expect(result.map((item) => item.UserID)).toEqual(expected);
    });

    it('getByFrequencyは100件超（130件）でも打ち切られず、ソートキー昇順のまま全件返る', async () => {
      // GSI2SK（UserID#AlertID）昇順の契約が挿入順に依存しないことを確認するため、
      // 降順（U0129→…→U0000）に挿入する。
      const total = 130;
      for (let i = total - 1; i >= 0; i -= 1) {
        await repository.create(
          buildAlertInput({ UserID: paddedUserId(i), Frequency: 'MINUTE_LEVEL' })
        );
      }

      const result = await repository.getByFrequency('MINUTE_LEVEL');

      const expected = Array.from({ length: total }, (_, i) => paddedUserId(i));
      expect(result.map((item) => item.UserID)).toEqual(expected);
    });

    it('getTemporaryCandidatesByFrequencyはTemporary=falseのアラートを候補に含めない', async () => {
      const frequency = 'MINUTE_LEVEL';
      const candidate = await repository.create(
        buildAlertInput({
          UserID: 'user-true',
          Frequency: frequency,
          Temporary: true,
          TemporaryExpireDate: '2024-01-02',
        })
      );
      await repository.create(
        buildAlertInput({ UserID: 'user-false', Frequency: frequency, Temporary: false })
      );

      const result = await repository.getTemporaryCandidatesByFrequency(frequency);

      expect(result.items.map((item) => item.AlertID)).toEqual([candidate.AlertID]);
    });

    it('markTemporaryAsExpiredを実行したアラートはgetTemporaryCandidatesByFrequencyの候補から外れる（再処理防止）', async () => {
      const frequency = 'HOURLY_LEVEL';
      const alert = await repository.create(
        buildAlertInput({
          UserID: 'user-expiring',
          Frequency: frequency,
          Temporary: true,
          TemporaryExpireDate: '2024-01-02',
        })
      );

      const beforeExpire = await repository.getTemporaryCandidatesByFrequency(frequency);
      expect(beforeExpire.items.map((item) => item.AlertID)).toEqual([alert.AlertID]);

      await repository.markTemporaryAsExpired(
        alert.UserID,
        alert.AlertID,
        Math.floor(Date.now() / 1000)
      );

      const afterExpire = await repository.getTemporaryCandidatesByFrequency(frequency);
      expect(afterExpire.items).toHaveLength(0);
    });

    it('getTemporaryCandidatesByFrequencyはoptions未指定時、既定で50件に制限される（実DynamoDB実装の既定limit=50との乖離防止）', async () => {
      const total = 130;
      for (let i = 0; i < total; i += 1) {
        await repository.create(
          buildAlertInput({
            UserID: paddedUserId(i),
            Frequency: 'MINUTE_LEVEL',
            Temporary: true,
            TemporaryExpireDate: '2024-01-02',
          })
        );
      }

      const result = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL');

      expect(result.items).toHaveLength(50);
      expect(result.nextCursor).toBeDefined();
    });

    it('getTemporaryCandidatesByFrequencyはlimit+cursorで、候補外（Temporary=false）が混在しても候補だけを重複・欠落なくソートキー昇順に走査できる（100件超のフィクスチャ）', async () => {
      // DynamoDBのFilterExpression併用時、Limitは「フィルタ後の返却件数」ではなく
      // 「評価したアイテム件数」に適用される。1ページの返却件数がlimitを下回っても
      // nextCursorで継続走査すれば全候補を取りこぼさないことを確認する
      // （dynamodb-alert.repository.ts・in-memory-alert.repository.ts双方に共通する挙動）。
      // GSI2SK（UserID#AlertID）昇順が挿入順に依存しないことも併せて確認するため、
      // 降順（U0119→…→U0000）に挿入する。
      const total = 120;
      for (let i = total - 1; i >= 0; i -= 1) {
        const isCandidate = i % 2 === 0;
        await repository.create(
          buildAlertInput({
            UserID: paddedUserId(i),
            Frequency: 'MINUTE_LEVEL',
            Temporary: isCandidate,
            ...(isCandidate ? { TemporaryExpireDate: '2024-01-02' } : {}),
          })
        );
      }

      const collected: string[] = [];
      let cursor: string | undefined;

      do {
        const page = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL', {
          limit: 15,
          cursor,
        });
        collected.push(...page.items.map((item) => item.UserID));
        cursor = page.nextCursor;
      } while (cursor);

      const expected = Array.from({ length: total }, (_, i) => i)
        .filter((i) => i % 2 === 0)
        .map((i) => paddedUserId(i));
      expect(collected).toEqual(expected);
    });

    // 【将来の退行ガード、乖離検知テストではない】
    // ProjectionExpression（dynamodb-alert.repository.ts）とAlertMapper.toTemporaryCandidate
    // が読む属性が現在ちょうど一致しているため、InMemoryがフルアイテムを返しても現状は
    // 両実装とも通る（＝今日この時点では実装間の乖離を検知できていない）。
    // これは将来TemporaryAlertCandidateに属性を追加してProjectionExpressionの更新を
    // 忘れた日に、実DynamoDB側だけが検証エラーで落ちるようにするためのガードである。
    it('TemporaryAlertCandidateはGSI2の射影だけで復元できる', async () => {
      const alert = await repository.create(
        buildAlertInput({
          UserID: 'user-projection',
          Frequency: 'MINUTE_LEVEL',
          Temporary: true,
          TemporaryExpireDate: '2024-01-02',
        })
      );

      const result = await repository.getTemporaryCandidatesByFrequency('MINUTE_LEVEL');

      expect(result.items).toEqual([
        {
          AlertID: alert.AlertID,
          UserID: alert.UserID,
          ExchangeID: alert.ExchangeID,
          Frequency: alert.Frequency,
          Enabled: alert.Enabled,
          Temporary: true,
          TemporaryExpireDate: alert.TemporaryExpireDate,
        },
      ]);
    });
  });
}
