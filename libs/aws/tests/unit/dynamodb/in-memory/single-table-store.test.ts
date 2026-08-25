import { InMemorySingleTableStore } from '../../../../src/dynamodb/in-memory/single-table-store';
import { EntityNotFoundError, EntityAlreadyExistsError } from '../../../../src/dynamodb/errors';
import type { DynamoDBItem } from '../../../../src/dynamodb/types';

describe('InMemorySingleTableStore', () => {
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
  });

  describe('基本操作', () => {
    describe('put', () => {
      it('アイテムを保存できる', () => {
        const item: DynamoDBItem = {
          PK: 'USER#123',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          Name: 'Test User',
        };

        store.put(item);

        expect(store.size()).toBe(1);
      });

      it('同じキーのアイテムを上書きできる', () => {
        const item1: DynamoDBItem = {
          PK: 'USER#123',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          Name: 'User 1',
        };

        const item2: DynamoDBItem = {
          PK: 'USER#123',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          Name: 'User 2',
        };

        store.put(item1);
        store.put(item2);

        expect(store.size()).toBe(1);
        const result = store.get('USER#123', 'PROFILE');
        expect(result?.Name).toBe('User 2');
      });

      it('条件付き保存で既存アイテムがある場合はエラーを投げる', () => {
        const item: DynamoDBItem = {
          PK: 'USER#123',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        };

        store.put(item);

        expect(() => {
          store.put(item, { attributeNotExists: true });
        }).toThrow(EntityAlreadyExistsError);
      });
    });

    describe('get', () => {
      it('保存したアイテムを取得できる', () => {
        const item: DynamoDBItem = {
          PK: 'USER#123',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          Name: 'Test User',
        };

        store.put(item);
        const result = store.get('USER#123', 'PROFILE');

        expect(result).toEqual(item);
      });

      it('存在しないアイテムは undefined を返す', () => {
        const result = store.get('USER#999', 'PROFILE');

        expect(result).toBeUndefined();
      });
    });

    describe('delete', () => {
      it('アイテムを削除できる', () => {
        const item: DynamoDBItem = {
          PK: 'USER#123',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        };

        store.put(item);
        store.delete('USER#123', 'PROFILE');

        expect(store.size()).toBe(0);
        expect(store.get('USER#123', 'PROFILE')).toBeUndefined();
      });

      it('条件付き削除で存在しないアイテムの場合はエラーを投げる', () => {
        expect(() => {
          store.delete('USER#999', 'PROFILE', { attributeExists: true });
        }).toThrow(EntityNotFoundError);
      });
    });
  });

  describe('クエリ操作', () => {
    beforeEach(() => {
      // テストデータを準備
      const items: DynamoDBItem[] = [
        {
          PK: 'USER#123',
          SK: 'HOLDING#AAPL',
          Type: 'Holding',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          TickerID: 'AAPL',
        },
        {
          PK: 'USER#123',
          SK: 'HOLDING#GOOGL',
          Type: 'Holding',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          TickerID: 'GOOGL',
        },
        {
          PK: 'USER#123',
          SK: 'HOLDING#MSFT',
          Type: 'Holding',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          TickerID: 'MSFT',
        },
        {
          PK: 'USER#456',
          SK: 'HOLDING#AAPL',
          Type: 'Holding',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          TickerID: 'AAPL',
        },
      ];

      items.forEach((item) => store.put(item));
    });

    describe('query', () => {
      it('PKで全アイテムを取得できる', () => {
        const result = store.query({ pk: 'USER#123' });

        expect(result.items).toHaveLength(3);
        expect(result.items.every((item) => item.PK === 'USER#123')).toBe(true);
      });

      it('SKの等価条件でフィルタリングできる', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'eq', value: 'HOLDING#AAPL' },
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].SK).toBe('HOLDING#AAPL');
      });

      it('SKの前方一致でフィルタリングできる', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'begins_with', value: 'HOLDING#' },
        });

        expect(result.items).toHaveLength(3);
      });

      it('SKの範囲条件でフィルタリングできる', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'between', value: ['HOLDING#A', 'HOLDING#H'] },
        });

        expect(result.items).toHaveLength(2);
        expect(result.items.map((item) => item.TickerID).sort()).toEqual(['AAPL', 'GOOGL']);
      });

      it('SKの比較演算子でフィルタリングできる (gte)', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'gte', value: 'HOLDING#G' },
        });

        expect(result.items).toHaveLength(2);
        expect(result.items.map((item) => item.TickerID).sort()).toEqual(['GOOGL', 'MSFT']);
      });

      it('SKの比較演算子でフィルタリングできる (gt)', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'gt', value: 'HOLDING#G' },
        });

        expect(result.items).toHaveLength(2);
      });

      it('SKの比較演算子でフィルタリングできる (lt)', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'lt', value: 'HOLDING#G' },
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].TickerID).toBe('AAPL');
      });

      it('SKの比較演算子でフィルタリングできる (lte)', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'lte', value: 'HOLDING#GOOGL' },
        });

        expect(result.items).toHaveLength(2);
      });

      it('不正なbetween条件（配列でない）は空の結果を返す', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'between', value: 'INVALID' as unknown as [string, string] },
        });

        expect(result.items).toHaveLength(0);
      });

      it('挿入順に依らずSKの昇順で返す（実DynamoDBのQueryと同様のソート順）', () => {
        store.clear();
        // 意図的に非ソート順（TSLA→AAPL→NVDA）で挿入する
        const items: DynamoDBItem[] = [
          {
            PK: 'USER#999',
            SK: 'HOLDING#TSLA',
            Type: 'Holding',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'TSLA',
          },
          {
            PK: 'USER#999',
            SK: 'HOLDING#AAPL',
            Type: 'Holding',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'AAPL',
          },
          {
            PK: 'USER#999',
            SK: 'HOLDING#NVDA',
            Type: 'Holding',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'NVDA',
          },
        ];
        items.forEach((item) => store.put(item));

        const result = store.query({ pk: 'USER#999' });

        expect(result.items.map((item) => item.SK)).toEqual([
          'HOLDING#AAPL',
          'HOLDING#NVDA',
          'HOLDING#TSLA',
        ]);
      });
    });

    describe('queryByAttribute', () => {
      beforeEach(() => {
        // GSI用のテストデータを追加
        const items: DynamoDBItem[] = [
          {
            PK: 'USER#123',
            SK: 'HOLDING#AAPL',
            Type: 'Holding',
            GSI1PK: 'TICKER#AAPL',
            GSI1SK: 'USER#123',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'AAPL',
          },
          {
            PK: 'USER#456',
            SK: 'HOLDING#AAPL',
            Type: 'Holding',
            GSI1PK: 'TICKER#AAPL',
            GSI1SK: 'USER#456',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'AAPL',
          },
        ];

        store.clear();
        items.forEach((item) => store.put(item));
      });

      it('属性値で全アイテムを取得できる', () => {
        const result = store.queryByAttribute({
          attributeName: 'GSI1PK',
          attributeValue: 'TICKER#AAPL',
        });

        expect(result.items).toHaveLength(2);
        expect(result.items.every((item) => item.GSI1PK === 'TICKER#AAPL')).toBe(true);
      });

      it('SKの条件でフィルタリングできる', () => {
        const result = store.queryByAttribute({
          attributeName: 'GSI1PK',
          attributeValue: 'TICKER#AAPL',
          sk: {
            attributeName: 'GSI1SK',
            operator: 'eq',
            value: 'USER#123',
          },
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].GSI1SK).toBe('USER#123');
      });

      it('挿入順に依らずGSIのSK属性昇順で返す（実DynamoDBのGSI Queryと同様のソート順）', () => {
        store.clear();
        // 意図的に非ソート順（Holding#TSLA→Holding#AAPL→Holding#NVDA）で挿入する
        const items: DynamoDBItem[] = [
          {
            PK: 'USER#001',
            SK: 'HOLDING#TSLA',
            Type: 'Holding',
            GSI1PK: 'USER#001',
            GSI1SK: 'Holding#TSLA',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'TSLA',
          },
          {
            PK: 'USER#001',
            SK: 'HOLDING#AAPL',
            Type: 'Holding',
            GSI1PK: 'USER#001',
            GSI1SK: 'Holding#AAPL',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'AAPL',
          },
          {
            PK: 'USER#001',
            SK: 'HOLDING#NVDA',
            Type: 'Holding',
            GSI1PK: 'USER#001',
            GSI1SK: 'Holding#NVDA',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'NVDA',
          },
        ];
        items.forEach((item) => store.put(item));

        const result = store.queryByAttribute({
          attributeName: 'GSI1PK',
          attributeValue: 'USER#001',
          sk: { attributeName: 'GSI1SK', operator: 'begins_with', value: 'Holding#' },
        });

        expect(result.items.map((item) => item.TickerID)).toEqual(['AAPL', 'NVDA', 'TSLA']);
      });

      it('sk条件を指定しない場合、gsiSortKeyAttributeNameで指定したGSIソートキー属性の昇順で返す', () => {
        store.clear();
        // 意図的に非ソート順（TSLA→AAPL→NVDA）で挿入する。GSI3SKが実際のソート対象になることを
        // 検証するため、ベーステーブルのSKはあえて逆順（Z→Y→X）にしておく
        // （もしSKにフォールバックしていたらAAPL/NVDA/TSLAの順にはならない）。
        const items: DynamoDBItem[] = [
          {
            PK: 'EXCHANGE#NASDAQ',
            SK: 'Z',
            Type: 'Ticker',
            GSI3PK: 'NASDAQ',
            GSI3SK: 'TICKER#TSLA',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'TSLA',
          },
          {
            PK: 'EXCHANGE#NASDAQ',
            SK: 'Y',
            Type: 'Ticker',
            GSI3PK: 'NASDAQ',
            GSI3SK: 'TICKER#AAPL',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'AAPL',
          },
          {
            PK: 'EXCHANGE#NASDAQ',
            SK: 'X',
            Type: 'Ticker',
            GSI3PK: 'NASDAQ',
            GSI3SK: 'TICKER#NVDA',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'NVDA',
          },
        ];
        items.forEach((item) => store.put(item));

        const result = store.queryByAttribute({
          attributeName: 'GSI3PK',
          attributeValue: 'NASDAQ',
          gsiSortKeyAttributeName: 'GSI3SK',
        });

        expect(result.items.map((item) => item.TickerID)).toEqual(['AAPL', 'NVDA', 'TSLA']);
      });

      it('skもgsiSortKeyAttributeNameも指定しない場合、従来どおりベーステーブルのSK属性昇順で返す（後方互換）', () => {
        store.clear();
        // GSI3SK昇順ならTSLA→AAPL→NVDAのままだが、SK（A→B→C）昇順ならAAPL→NVDA→TSLAになる
        const items: DynamoDBItem[] = [
          {
            PK: 'EXCHANGE#NASDAQ',
            SK: 'C',
            Type: 'Ticker',
            GSI3PK: 'NASDAQ',
            GSI3SK: 'TICKER#TSLA',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'TSLA',
          },
          {
            PK: 'EXCHANGE#NASDAQ',
            SK: 'A',
            Type: 'Ticker',
            GSI3PK: 'NASDAQ',
            GSI3SK: 'TICKER#AAPL',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'AAPL',
          },
          {
            PK: 'EXCHANGE#NASDAQ',
            SK: 'B',
            Type: 'Ticker',
            GSI3PK: 'NASDAQ',
            GSI3SK: 'TICKER#NVDA',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'NVDA',
          },
        ];
        items.forEach((item) => store.put(item));

        const result = store.queryByAttribute({
          attributeName: 'GSI3PK',
          attributeValue: 'NASDAQ',
        });

        expect(result.items.map((item) => item.TickerID)).toEqual(['AAPL', 'NVDA', 'TSLA']);
      });

      it('sk条件を指定した場合、gsiSortKeyAttributeNameを渡していてもsk.attributeName側が優先される', () => {
        store.clear();
        const items: DynamoDBItem[] = [
          {
            PK: 'EXCHANGE#NASDAQ',
            SK: 'HOLDING#TSLA',
            Type: 'Ticker',
            GSI3PK: 'NASDAQ',
            GSI3SK: 'TICKER#TSLA',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'TSLA',
          },
          {
            PK: 'EXCHANGE#NASDAQ',
            SK: 'HOLDING#AAPL',
            Type: 'Ticker',
            GSI3PK: 'NASDAQ',
            GSI3SK: 'TICKER#AAPL',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'AAPL',
          },
        ];
        items.forEach((item) => store.put(item));

        // gsiSortKeyAttributeNameには存在しない属性名（DOES_NOT_EXIST）を渡す。
        // sk側が優先されるなら結果はGSI3SK昇順（AAPL, TSLA）になる。
        // 優先順位が逆転してgsiSortKeyAttributeName側が使われた場合、全アイテムの
        // DOES_NOT_EXIST属性はundefinedで揃うためソートキーが全て空文字列(String(undefined ?? ''))
        // になり、安定ソートにより挿入順（TSLA, AAPL）がそのまま残る。
        // よってこの2パターンは値が異なり、優先順位の逆転を確実に検知できる。
        const result = store.queryByAttribute({
          attributeName: 'GSI3PK',
          attributeValue: 'NASDAQ',
          sk: { attributeName: 'GSI3SK', operator: 'begins_with', value: 'TICKER#' },
          gsiSortKeyAttributeName: 'DOES_NOT_EXIST',
        });

        expect(result.items.map((item) => item.TickerID)).toEqual(['AAPL', 'TSLA']);
      });

      it('ソートキーがNumber型の場合は数値の昇順でソートする（桁数不揃いの値で辞書順との違いを検証する）', () => {
        store.clear();
        // 数値昇順なら 2, 9, 10, 100。文字列辞書順だと "10" < "100" < "2" < "9" になり、
        // この期待値とは一致しない（livetalkのGSI3SK=Care、GSI4SK=NextReviewを想定した値）。
        const careValues = [10, 100, 2, 9];
        const items: DynamoDBItem[] = careValues.map((care, index) => ({
          PK: 'USER#u1',
          SK: `TOPIC#t${index}#META`,
          Type: 'Topic',
          GSI3PK: 'hiyori#TOPICS#u1',
          GSI3SK: care,
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        }));
        items.forEach((item) => store.put(item));

        const result = store.queryByAttribute({
          attributeName: 'GSI3PK',
          attributeValue: 'hiyori#TOPICS#u1',
          gsiSortKeyAttributeName: 'GSI3SK',
        });

        expect(result.items.map((item) => item.GSI3SK)).toEqual([2, 9, 10, 100]);
      });

      it('ソートキーの型が混在する場合は文字列化した辞書順にフォールバックする（同一GSI内は単一型の前提のため、混在時の正しい順序は保証しない）', () => {
        store.clear();
        const items: DynamoDBItem[] = [
          {
            PK: 'USER#u1',
            SK: 'A',
            Type: 'Mixed',
            GSI3PK: 'group',
            GSI3SK: 10,
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
          },
          {
            PK: 'USER#u1',
            SK: 'B',
            Type: 'Mixed',
            GSI3PK: 'group',
            GSI3SK: '2',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
          },
        ];
        items.forEach((item) => store.put(item));

        const result = store.queryByAttribute({
          attributeName: 'GSI3PK',
          attributeValue: 'group',
          gsiSortKeyAttributeName: 'GSI3SK',
        });

        // 数値10と文字列'2'は型が混在するため数値同士の比較にはならず、
        // String(10)='10' と '2' の辞書順比較（'10' < '2'）にフォールバックする
        expect(result.items.map((item) => item.SK)).toEqual(['A', 'B']);
      });
    });

    describe('queryByAttribute の射影（projection）', () => {
      beforeEach(() => {
        store.clear();
        const item: DynamoDBItem = {
          PK: 'USER#1',
          SK: 'TOPIC#t1#META',
          Type: 'Topic',
          GSI3PK: 'char#TOPICS#u1',
          GSI3SK: 5,
          CreatedAt: 1,
          UpdatedAt: 2,
          Subject: '件名',
          RequestText: '依頼テキスト',
          RequestedAt: 99,
        };
        store.put(item);
      });

      it('projection未指定時はフルアイテムを返す（従来どおりのALL相当。既存呼び出し元の後方互換）', () => {
        const result = store.queryByAttribute({
          attributeName: 'GSI3PK',
          attributeValue: 'char#TOPICS#u1',
        });

        expect(result.items[0]).toEqual(
          expect.objectContaining({ Subject: '件名', RequestText: '依頼テキスト', RequestedAt: 99 })
        );
      });

      it("type:'ALL' を明示してもフルアイテムを返す", () => {
        const result = store.queryByAttribute({
          attributeName: 'GSI3PK',
          attributeValue: 'char#TOPICS#u1',
          projection: { type: 'ALL', keyAttributeNames: ['GSI3PK', 'GSI3SK'] },
        });

        expect(result.items[0].RequestText).toBe('依頼テキスト');
        expect(result.items[0].RequestedAt).toBe(99);
      });

      it("type:'KEYS_ONLY' はベーステーブルキー（PK/SK）とGSIキー属性のみを返す", () => {
        const result = store.queryByAttribute({
          attributeName: 'GSI3PK',
          attributeValue: 'char#TOPICS#u1',
          projection: { type: 'KEYS_ONLY', keyAttributeNames: ['GSI3PK', 'GSI3SK'] },
        });

        expect(result.items[0]).toEqual({
          PK: 'USER#1',
          SK: 'TOPIC#t1#META',
          GSI3PK: 'char#TOPICS#u1',
          GSI3SK: 5,
        });
      });

      it("type:'INCLUDE' はベーステーブルキー＋GSIキー＋指定した非キー属性のみを返す（未指定の属性は含まれない）", () => {
        const result = store.queryByAttribute({
          attributeName: 'GSI3PK',
          attributeValue: 'char#TOPICS#u1',
          projection: {
            type: 'INCLUDE',
            keyAttributeNames: ['GSI3PK', 'GSI3SK'],
            nonKeyAttributes: ['Subject', 'CreatedAt'],
          },
        });

        expect(result.items[0]).toEqual({
          PK: 'USER#1',
          SK: 'TOPIC#t1#META',
          GSI3PK: 'char#TOPICS#u1',
          GSI3SK: 5,
          Subject: '件名',
          CreatedAt: 1,
        });
        expect((result.items[0] as Record<string, unknown>).RequestText).toBeUndefined();
        expect((result.items[0] as Record<string, unknown>).RequestedAt).toBeUndefined();
        expect((result.items[0] as Record<string, unknown>).UpdatedAt).toBeUndefined();
      });

      it('sk条件を渡さないGSIクエリでも、keyAttributeNamesで指定したGSIのソートキー属性は射影に含まれる', () => {
        // InMemoryTopicRepository.queryGsi3 相当：sk条件を渡さずPK一致のみでクエリする場合でも、
        // 実DynamoDBはGSIのソートキー属性を常に射影に含めるため、落としてはいけない。
        const result = store.queryByAttribute({
          attributeName: 'GSI3PK',
          attributeValue: 'char#TOPICS#u1',
          projection: { type: 'KEYS_ONLY', keyAttributeNames: ['GSI3PK', 'GSI3SK'] },
        });

        expect(result.items[0].GSI3SK).toBe(5);
      });

      it('射影はストア内の元アイテムを変更せず、絞り込んだコピーを返す', () => {
        store.queryByAttribute({
          attributeName: 'GSI3PK',
          attributeValue: 'char#TOPICS#u1',
          projection: { type: 'KEYS_ONLY', keyAttributeNames: ['GSI3PK', 'GSI3SK'] },
        });

        const stored = store.get('USER#1', 'TOPIC#t1#META');
        expect(stored?.Subject).toBe('件名');
        expect(stored?.RequestText).toBe('依頼テキスト');
      });
    });

    describe('scan', () => {
      it('全アイテムを取得できる', () => {
        const result = store.scan();

        expect(result.items).toHaveLength(4);
      });
    });
  });

  describe('ページネーション', () => {
    beforeEach(() => {
      // 大量のテストデータを準備
      const items: DynamoDBItem[] = [];
      for (let i = 0; i < 10; i++) {
        items.push({
          PK: 'USER#123',
          SK: `HOLDING#TICKER${i.toString().padStart(2, '0')}`,
          Type: 'Holding',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        });
      }
      items.forEach((item) => store.put(item));
    });

    it('limit で取得数を制限できる', () => {
      const result = store.query({ pk: 'USER#123' }, { limit: 3 });

      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBeDefined();
    });

    it('cursor で次のページを取得できる', () => {
      const firstPage = store.query({ pk: 'USER#123' }, { limit: 3 });
      const secondPage = store.query(
        { pk: 'USER#123' },
        { limit: 3, cursor: firstPage.nextCursor }
      );

      expect(secondPage.items).toHaveLength(3);
      expect(secondPage.items[0].SK).not.toBe(firstPage.items[0].SK);
    });

    it('最後のページでは nextCursor が undefined', () => {
      const result = store.query({ pk: 'USER#123' }, { limit: 100 });

      expect(result.items).toHaveLength(10);
      expect(result.nextCursor).toBeUndefined();
    });

    it('無効なカーソルの場合はインデックス0から開始する', () => {
      const result = store.query({ pk: 'USER#123' }, { limit: 3, cursor: 'invalid-cursor' });

      expect(result.items).toHaveLength(3);
    });

    it('queryByAttribute でもページネーションが機能する', () => {
      store.clear();
      const items: DynamoDBItem[] = [];
      for (let i = 0; i < 10; i++) {
        items.push({
          PK: `USER#${i}`,
          SK: 'PROFILE',
          Type: 'User',
          GSI1PK: 'ACTIVE',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        });
      }
      items.forEach((item) => store.put(item));

      const result = store.queryByAttribute(
        { attributeName: 'GSI1PK', attributeValue: 'ACTIVE' },
        { limit: 3 }
      );

      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBeDefined();
    });

    it('scan でもページネーションが機能する', () => {
      const result = store.scan({ limit: 3 });

      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBeDefined();
    });
  });

  describe('ユーティリティ', () => {
    it('clear でストアを空にできる', () => {
      const item: DynamoDBItem = {
        PK: 'USER#123',
        SK: 'PROFILE',
        Type: 'User',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      store.put(item);
      store.clear();

      expect(store.size()).toBe(0);
    });

    it('size でアイテム数を取得できる', () => {
      expect(store.size()).toBe(0);

      const items: DynamoDBItem[] = [
        {
          PK: 'USER#123',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        },
        {
          PK: 'USER#456',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        },
      ];

      items.forEach((item) => store.put(item));

      expect(store.size()).toBe(2);
    });
  });
});
