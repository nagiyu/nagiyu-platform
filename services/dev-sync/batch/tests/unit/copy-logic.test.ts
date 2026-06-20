/**
 * コピーロジックの単体テスト
 *
 * InMemorySingleTableStore を InMemoryStoreAdapter でラップして
 * コピーロジックを副作用なしで検証する。
 */

import { InMemorySingleTableStore } from '@nagiyu/aws';
import type { DynamoDBItem } from '@nagiyu/aws';
import { InMemoryStoreAdapter } from '../../src/lib/in-memory-store-adapter.js';
import {
  runCopy,
  runMirrorCopy,
  runGsiWindowCopy,
  assertDestIsDevTable,
} from '../../src/lib/copy-logic.js';
import type { JobConfig } from '../../src/lib/types.js';

// テスト用の DynamoDB アイテム生成ヘルパー
function makeItem(pk: string, sk: string, extra: Record<string, unknown> = {}): DynamoDBItem {
  return {
    PK: pk,
    SK: sk,
    Type: 'TestItem',
    CreatedAt: Date.now(),
    UpdatedAt: Date.now(),
    ...extra,
  };
}

describe('assertDestIsDevTable', () => {
  it('"-dev" で終わるテーブル名は通過する', () => {
    expect(() => assertDestIsDevTable('nagiyu-foo-main-dev')).not.toThrow();
  });

  it('"-dev" で終わらないテーブル名は Error をスローする', () => {
    expect(() => assertDestIsDevTable('nagiyu-foo-main-prod')).toThrow(
      'コピー先テーブルが "-dev" で終わっていません'
    );
  });

  it('"-dev" が途中にある場合もエラーになる', () => {
    expect(() => assertDestIsDevTable('nagiyu-dev-main-prod')).toThrow(
      'コピー先テーブルが "-dev" で終わっていません'
    );
  });

  it('空文字列はエラーになる', () => {
    expect(() => assertDestIsDevTable('')).toThrow('コピー先テーブルが "-dev" で終わっていません');
  });
});

describe('mirror 戦略', () => {
  let prodStore: InMemorySingleTableStore;
  let devStore: InMemorySingleTableStore;
  let prodAdapter: InMemoryStoreAdapter;
  let devAdapter: InMemoryStoreAdapter;

  const baseConfig: JobConfig = {
    sourceTable: 'nagiyu-test-prod',
    destTable: 'nagiyu-test-dev',
    strategy: 'mirror',
    delete: 'on',
  };

  beforeEach(() => {
    prodStore = new InMemorySingleTableStore();
    devStore = new InMemorySingleTableStore();
    prodAdapter = new InMemoryStoreAdapter(prodStore);
    devAdapter = new InMemoryStoreAdapter(devStore);
  });

  describe('コピー先行の順序', () => {
    it('upsert が delete より先に実行されることを確認（アイテム整合性）', async () => {
      // prod に 2 件
      prodStore.put(makeItem('USER#1', 'PROFILE', { name: 'Alice' }));
      prodStore.put(makeItem('USER#2', 'PROFILE', { name: 'Bob' }));
      // dev に同じ 2 件（prod と同一状態）
      devStore.put(makeItem('USER#1', 'PROFILE', { name: 'Alice' }));
      devStore.put(makeItem('USER#2', 'PROFILE', { name: 'Bob' }));

      const result = await runMirrorCopy(prodAdapter, devAdapter, baseConfig);

      // コピー先は prod と同一になる
      expect(devStore.size()).toBe(2);
      expect(devStore.get('USER#1', 'PROFILE')?.name).toBe('Alice');
      expect(devStore.get('USER#2', 'PROFILE')?.name).toBe('Bob');
      expect(result.upserted).toBe(2);
      expect(result.deleted).toBe(0);
    });
  });

  describe('差分削除 (delete=on)', () => {
    it('prod に存在しない dev アイテムが削除される', async () => {
      // prod に 1 件
      prodStore.put(makeItem('USER#1', 'PROFILE'));
      // dev に 2 件（USER#2 は prod に無い）
      devStore.put(makeItem('USER#1', 'PROFILE'));
      devStore.put(makeItem('USER#2', 'PROFILE'));

      const result = await runMirrorCopy(prodAdapter, devAdapter, baseConfig);

      expect(devStore.size()).toBe(1);
      expect(devStore.get('USER#1', 'PROFILE')).toBeDefined();
      expect(devStore.get('USER#2', 'PROFILE')).toBeUndefined();
      expect(result.upserted).toBe(1);
      expect(result.deleted).toBe(1);
    });

    it('prod に存在する dev アイテムは削除されない', async () => {
      // prod と dev が同一
      prodStore.put(makeItem('USER#1', 'PROFILE'));
      devStore.put(makeItem('USER#1', 'PROFILE'));

      const result = await runMirrorCopy(prodAdapter, devAdapter, baseConfig);

      expect(devStore.size()).toBe(1);
      expect(result.deleted).toBe(0);
    });

    it('prod が空の場合、dev のアイテムが全削除される', async () => {
      // prod は空
      // dev に 2 件
      devStore.put(makeItem('USER#1', 'PROFILE'));
      devStore.put(makeItem('USER#2', 'PROFILE'));

      const result = await runMirrorCopy(prodAdapter, devAdapter, baseConfig);

      expect(devStore.size()).toBe(0);
      expect(result.upserted).toBe(0);
      expect(result.deleted).toBe(2);
    });
  });

  describe('差分削除なし (delete=off)', () => {
    it('delete=off の場合、prod に無い dev アイテムは残る', async () => {
      const config: JobConfig = { ...baseConfig, delete: 'off' };

      // prod に 1 件
      prodStore.put(makeItem('USER#1', 'PROFILE'));
      // dev に 2 件
      devStore.put(makeItem('USER#1', 'PROFILE'));
      devStore.put(makeItem('USER#2', 'PROFILE')); // prod に無い

      const result = await runMirrorCopy(prodAdapter, devAdapter, config);

      // USER#2 は削除されない
      expect(devStore.size()).toBe(2);
      expect(devStore.get('USER#2', 'PROFILE')).toBeDefined();
      expect(result.deleted).toBe(0);
    });
  });

  describe('冪等性', () => {
    it('同じ状態で 2 回実行しても結果が変わらない', async () => {
      prodStore.put(makeItem('USER#1', 'PROFILE', { name: 'Alice' }));
      prodStore.put(makeItem('USER#2', 'PROFILE', { name: 'Bob' }));

      await runMirrorCopy(prodAdapter, devAdapter, baseConfig);
      const result2 = await runMirrorCopy(prodAdapter, devAdapter, baseConfig);

      expect(devStore.size()).toBe(2);
      expect(devStore.get('USER#1', 'PROFILE')?.name).toBe('Alice');
      expect(devStore.get('USER#2', 'PROFILE')?.name).toBe('Bob');
      expect(result2.deleted).toBe(0);
    });

    it('prod のデータが変わっても正しく同期される（冪等）', async () => {
      // 初回: prod に 2 件
      prodStore.put(makeItem('USER#1', 'PROFILE', { version: 1 }));
      prodStore.put(makeItem('USER#2', 'PROFILE', { version: 1 }));
      await runMirrorCopy(prodAdapter, devAdapter, baseConfig);

      // prod を更新（USER#2 削除 + USER#3 追加）
      prodStore.delete('USER#2', 'PROFILE');
      prodStore.put(makeItem('USER#3', 'PROFILE', { version: 2 }));

      const result = await runMirrorCopy(prodAdapter, devAdapter, baseConfig);

      expect(devStore.size()).toBe(2);
      expect(devStore.get('USER#1', 'PROFILE')).toBeDefined();
      expect(devStore.get('USER#2', 'PROFILE')).toBeUndefined();
      expect(devStore.get('USER#3', 'PROFILE')).toBeDefined();
      expect(result.upserted).toBe(2);
      expect(result.deleted).toBe(1);
    });
  });

  describe('PK プレフィックスによるスコープ制限', () => {
    it('pkPrefix を指定した場合、マッチするアイテムのみコピーされる', async () => {
      // prod に複数 PK のアイテム
      prodStore.put(makeItem('USER#1', 'PROFILE'));
      prodStore.put(makeItem('ORDER#1', 'ITEM'));

      const config: JobConfig = {
        ...baseConfig,
        scope: { pkPrefix: 'USER#' },
        delete: 'off',
      };

      const result = await runMirrorCopy(prodAdapter, devAdapter, config);

      // USER# のみコピーされる
      expect(devStore.get('USER#1', 'PROFILE')).toBeDefined();
      expect(devStore.get('ORDER#1', 'ITEM')).toBeUndefined();
      expect(result.upserted).toBe(1);
    });
  });

  describe('安全ガード: dest が -dev で終わらない場合', () => {
    it('destTable が -dev で終わらない場合は即 abort（upsert は実行されない）', async () => {
      prodStore.put(makeItem('USER#1', 'PROFILE'));

      const dangerousConfig: JobConfig = {
        ...baseConfig,
        destTable: 'nagiyu-test-prod', // prod テーブルを誤って指定
      };

      await expect(runMirrorCopy(prodAdapter, devAdapter, dangerousConfig)).rejects.toThrow(
        'コピー先テーブルが "-dev" で終わっていません'
      );

      // dev は変更されていない
      expect(devStore.size()).toBe(0);
    });
  });
});

describe('gsiWindow 戦略', () => {
  let prodStore: InMemorySingleTableStore;
  let devStore: InMemorySingleTableStore;
  let prodAdapter: InMemoryStoreAdapter;
  let devAdapter: InMemoryStoreAdapter;

  const baseGsiConfig: JobConfig = {
    sourceTable: 'nagiyu-test-prod',
    destTable: 'nagiyu-test-dev',
    strategy: 'gsiWindow',
    delete: 'off',
    gsi: {
      indexName: 'GSI1',
      pkAttributeName: 'GSI1PK',
      pkValue: 'ALERT',
      skAttributeName: 'GSI1SK',
      windowDays: 7,
    },
  };

  // 基準日を固定して冪等なテストにする
  const NOW = new Date('2026-06-15T00:00:00.000Z');

  function makeAlertItem(sk: string): DynamoDBItem {
    return makeItem(`ALERT#${sk}`, 'META', {
      GSI1PK: 'ALERT',
      GSI1SK: sk, // ISO 8601 日時
    });
  }

  beforeEach(() => {
    prodStore = new InMemorySingleTableStore();
    devStore = new InMemorySingleTableStore();
    prodAdapter = new InMemoryStoreAdapter(prodStore);
    devAdapter = new InMemoryStoreAdapter(devStore);
  });

  describe('直近 N 日フィルタ', () => {
    it('windowDays 内のアイテムがコピーされる', async () => {
      // 7 日以内
      prodStore.put(makeAlertItem('2026-06-10T00:00:00.000Z'));
      // 7 日より古い
      prodStore.put(makeAlertItem('2026-06-07T00:00:00.000Z'));

      const result = await runGsiWindowCopy(prodAdapter, devAdapter, baseGsiConfig, NOW);

      // 7 日以内の 1 件のみコピーされる
      // ウィンドウ下限: 2026-06-08T00:00:00.000Z
      expect(devStore.size()).toBe(1);
      expect(devStore.get('ALERT#2026-06-10T00:00:00.000Z', 'META')).toBeDefined();
      expect(devStore.get('ALERT#2026-06-07T00:00:00.000Z', 'META')).toBeUndefined();
      expect(result.upserted).toBe(1);
    });

    it('削除は行わない（dev に余分なアイテムが残る）', async () => {
      // prod に 1 件（7 日以内）
      prodStore.put(makeAlertItem('2026-06-10T00:00:00.000Z'));
      // dev に古いアイテム（prod に無い）
      devStore.put(makeAlertItem('2026-01-01T00:00:00.000Z'));

      const result = await runGsiWindowCopy(prodAdapter, devAdapter, baseGsiConfig, NOW);

      // dev の古いアイテムは残る
      expect(devStore.size()).toBe(2);
      expect(result.deleted).toBe(0);
    });
  });

  describe('冪等性', () => {
    it('2 回実行しても結果が変わらない', async () => {
      prodStore.put(makeAlertItem('2026-06-10T00:00:00.000Z'));

      await runGsiWindowCopy(prodAdapter, devAdapter, baseGsiConfig, NOW);
      const result2 = await runGsiWindowCopy(prodAdapter, devAdapter, baseGsiConfig, NOW);

      expect(devStore.size()).toBe(1);
      expect(result2.upserted).toBe(1);
      expect(result2.deleted).toBe(0);
    });
  });

  describe('gsi 設定未指定のエラー', () => {
    it('gsi が未指定の場合はエラーをスローする', async () => {
      const config: JobConfig = {
        ...baseGsiConfig,
        gsi: undefined,
      };

      await expect(runGsiWindowCopy(prodAdapter, devAdapter, config, NOW)).rejects.toThrow(
        'gsiWindow 戦略では gsi 設定が必須です'
      );
    });
  });

  describe('安全ガード: dest が -dev で終わらない場合', () => {
    it('destTable が -dev で終わらない場合は即 abort', async () => {
      prodStore.put(makeAlertItem('2026-06-10T00:00:00.000Z'));

      const dangerousConfig: JobConfig = {
        ...baseGsiConfig,
        destTable: 'nagiyu-test-prod',
      };

      await expect(runGsiWindowCopy(prodAdapter, devAdapter, dangerousConfig, NOW)).rejects.toThrow(
        'コピー先テーブルが "-dev" で終わっていません'
      );

      expect(devStore.size()).toBe(0);
    });
  });
});

describe('runCopy（汎用エントリポイント）', () => {
  let prodStore: InMemorySingleTableStore;
  let devStore: InMemorySingleTableStore;
  let prodAdapter: InMemoryStoreAdapter;
  let devAdapter: InMemoryStoreAdapter;

  beforeEach(() => {
    prodStore = new InMemorySingleTableStore();
    devStore = new InMemorySingleTableStore();
    prodAdapter = new InMemoryStoreAdapter(prodStore);
    devAdapter = new InMemoryStoreAdapter(devStore);
  });

  it('strategy=mirror で runMirrorCopy が呼ばれる', async () => {
    prodStore.put({
      PK: 'USER#1',
      SK: 'PROFILE',
      Type: 'User',
      CreatedAt: Date.now(),
      UpdatedAt: Date.now(),
    });

    const config: JobConfig = {
      sourceTable: 'nagiyu-test-prod',
      destTable: 'nagiyu-test-dev',
      strategy: 'mirror',
      delete: 'off',
    };

    const result = await runCopy(prodAdapter, devAdapter, config);

    expect(result.upserted).toBe(1);
    expect(devStore.size()).toBe(1);
  });

  it('strategy=gsiWindow で runGsiWindowCopy が呼ばれる', async () => {
    const now = new Date('2026-06-15T00:00:00.000Z');
    prodStore.put({
      PK: 'ALERT#1',
      SK: 'META',
      Type: 'Alert',
      GSI1PK: 'ALERT',
      GSI1SK: '2026-06-10T00:00:00.000Z',
      CreatedAt: Date.now(),
      UpdatedAt: Date.now(),
    });

    const config: JobConfig = {
      sourceTable: 'nagiyu-test-prod',
      destTable: 'nagiyu-test-dev',
      strategy: 'gsiWindow',
      delete: 'off',
      gsi: {
        indexName: 'GSI1',
        pkAttributeName: 'GSI1PK',
        pkValue: 'ALERT',
        skAttributeName: 'GSI1SK',
        windowDays: 7,
      },
    };

    const result = await runCopy(prodAdapter, devAdapter, config, now);

    expect(result.upserted).toBe(1);
    expect(devStore.size()).toBe(1);
  });

  it('destTable が -dev で終わらない場合は両戦略ともに abort される', async () => {
    const config: JobConfig = {
      sourceTable: 'nagiyu-test-prod',
      destTable: 'nagiyu-test-prod', // 危険: prod を指定
      strategy: 'mirror',
      delete: 'off',
    };

    await expect(runCopy(prodAdapter, devAdapter, config)).rejects.toThrow(
      'コピー先テーブルが "-dev" で終わっていません'
    );
  });
});
