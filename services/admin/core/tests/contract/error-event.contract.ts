/**
 * ErrorEvent の書き込み (ErrorEventWriter) と参照 (ErrorEventReader) の契約テスト
 *
 * InMemory 実装と実 DynamoDB (DynamoDB Local) の双方に同一の仕様を通し、
 * 実装間の乖離 (キー設計・範囲比較・並び順・旧形式の読み取り) を機械的に検知する。
 * 各テストは決定的で単一の結末を持ち、実行時分岐で結末を変えない。
 */

import { EntityAlreadyExistsError } from '@nagiyu/aws';
import type { ErrorEventWriter } from '@nagiyu/aws';
import type { ErrorEvent } from '@nagiyu/common';
import type { ErrorEventReader } from '../../src/errors/reader.js';

/** 書き込み・参照・生の Item 操作をまとめた、テスト対象実装の組 */
export interface ErrorEventFixture {
  writer: ErrorEventWriter;
  reader: ErrorEventReader;
  /** 保存形式を指定してそのまま書く (旧形式のアイテムを用意するために使う) */
  putRawItem: (item: Record<string, unknown>) => Promise<void>;
  /** 保存されているアイテムを PK/SK で読む */
  getRawItem: (pk: string, sk: string) => Promise<Record<string, unknown> | undefined>;
}

/** 契約テストの対象実装が満たすべきフック */
export interface ErrorEventContractHooks {
  /** テスト対象を生成する (reset の後に呼ばれる) */
  makeFixture: () => Promise<ErrorEventFixture>;
  /** 各テスト前にストア／テーブルをクリーンな状態に戻す */
  reset: () => Promise<void>;
  /** 全テスト終了後の後始末 */
  teardown?: () => Promise<void>;
}

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

const at = (iso: string): number => Date.parse(iso);

function buildEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    eventId: 'evt-1',
    serviceId: 'stock-tracker',
    source: 'cloudwatch-alarm',
    severity: 'error',
    title: 'sample (ALARM)',
    message: 'Threshold Crossed',
    context: '{"raw":true}',
    occurredAt: at('2026-05-06T01:00:00.000Z'),
    ...overrides,
  };
}

/** ミリ秒化の前に書かれた旧形式のアイテム (小文字始まりの属性・ISO 文字列・ttl) */
function buildLegacyItem(overrides: Partial<Record<string, unknown>> = {}) {
  const base = {
    eventId: 'legacy-1',
    serviceId: 'stock-tracker',
    source: 'application',
    severity: 'warning',
    title: '旧形式',
    message: '旧形式のメッセージ',
    context: '{}',
    occurredAt: '2026-05-06T00:30:00.000Z',
    ...overrides,
  };
  const sortKey = `OCCURRED#${base.occurredAt}#${base.eventId}`;
  return {
    PK: `ERROR_EVENT#${base.serviceId}`,
    SK: sortKey,
    Type: 'ErrorEvent',
    GSI1PK: 'ERROR_EVENT_ALL',
    GSI1SK: sortKey,
    ...base,
    ttl: 1800000000,
    CreatedAt: 1,
    UpdatedAt: 1,
  };
}

/**
 * ErrorEvent の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル (describe 名に使用)
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineErrorEventContract(label: string, hooks: ErrorEventContractHooks): void {
  describe(`ErrorEvent 契約: ${label}`, () => {
    let fixture: ErrorEventFixture;

    beforeEach(async () => {
      await hooks.reset();
      fixture = await hooks.makeFixture();
    });

    if (hooks.teardown) {
      afterAll(hooks.teardown);
    }

    describe('書き込み', () => {
      it('新形式の属性で書き、TTL (エポック秒) を付け、旧名の ttl は付けない', async () => {
        const event = buildEvent();
        await fixture.writer.put(event);

        const item = await fixture.getRawItem(
          'ERROR_EVENT#stock-tracker',
          'OCCURRED#2026-05-06T01:00:00.000Z#evt-1'
        );

        expect(item).toMatchObject({
          Type: 'ErrorEvent',
          GSI1PK: 'ERROR_EVENT_ALL',
          GSI1SK: 'OCCURRED#2026-05-06T01:00:00.000Z#evt-1',
          EventID: 'evt-1',
          ServiceID: 'stock-tracker',
          Source: 'cloudwatch-alarm',
          Severity: 'error',
          Title: event.title,
          Message: event.message,
          Context: event.context,
          OccurredAt: event.occurredAt,
          TTL: Math.floor((event.occurredAt + 180 * MILLIS_PER_DAY) / 1000),
        });
        expect(typeof item?.CreatedAt).toBe('number');
        expect(typeof item?.UpdatedAt).toBe('number');
        for (const legacy of ['ttl', 'eventId', 'serviceId', 'occurredAt', 'title']) {
          expect(item).not.toHaveProperty(legacy);
        }
      });

      it('同じイベントを再度書くと EntityAlreadyExistsError で拒否する', async () => {
        await fixture.writer.put(buildEvent());

        await expect(fixture.writer.put(buildEvent({ title: '別の内容' }))).rejects.toThrow(
          EntityAlreadyExistsError
        );
      });

      it('title が空のイベントは書かない', async () => {
        await expect(fixture.writer.put(buildEvent({ title: '' }))).rejects.toThrow(
          'title は空文字にできません'
        );
        expect((await fixture.reader.list({})).items).toEqual([]);
      });

      it('解釈できない occurredAt のイベントは書かない', async () => {
        await expect(fixture.writer.put(buildEvent({ occurredAt: Number.NaN }))).rejects.toThrow(
          'occurredAt'
        );
        expect((await fixture.reader.list({})).items).toEqual([]);
      });
    });

    describe('参照', () => {
      it('書いたイベントを findById で同じ内容のまま読める', async () => {
        const event = buildEvent();
        await fixture.writer.put(event);

        await expect(
          fixture.reader.findById(event.eventId, event.occurredAt, event.serviceId)
        ).resolves.toEqual(event);
      });

      it('findById は eventId・発生時刻・serviceId のどれかが違えば null', async () => {
        const event = buildEvent();
        await fixture.writer.put(event);

        expect(
          await fixture.reader.findById('other', event.occurredAt, event.serviceId)
        ).toBeNull();
        expect(
          await fixture.reader.findById(event.eventId, event.occurredAt + 1, event.serviceId)
        ).toBeNull();
        expect(await fixture.reader.findById(event.eventId, event.occurredAt, 'admin')).toBeNull();
      });

      it('list は発生時刻の降順で、サービスを横断して返す', async () => {
        await fixture.writer.put(
          buildEvent({ eventId: 'a', occurredAt: at('2026-05-06T00:00:00Z') })
        );
        await fixture.writer.put(
          buildEvent({ eventId: 'b', serviceId: 'admin', occurredAt: at('2026-05-06T02:00:00Z') })
        );
        await fixture.writer.put(
          buildEvent({ eventId: 'c', occurredAt: at('2026-05-05T23:00:00Z') })
        );

        const result = await fixture.reader.list({});

        expect(result.items.map((e) => e.eventId)).toEqual(['b', 'a', 'c']);
        expect(result.items[0].occurredAt).toBe(at('2026-05-06T02:00:00Z'));
      });

      it('list は serviceId で絞り込める', async () => {
        await fixture.writer.put(buildEvent({ eventId: 'a' }));
        await fixture.writer.put(buildEvent({ eventId: 'b', serviceId: 'admin' }));

        const result = await fixture.reader.list({ serviceId: 'admin' });

        expect(result.items.map((e) => e.eventId)).toEqual(['b']);
      });

      it('list は from / to を含めて範囲で絞り込む', async () => {
        await fixture.writer.put(
          buildEvent({ eventId: 'a', occurredAt: at('2026-05-01T00:00:00Z') })
        );
        await fixture.writer.put(
          buildEvent({ eventId: 'b', occurredAt: at('2026-05-05T00:00:00Z') })
        );
        await fixture.writer.put(
          buildEvent({ eventId: 'c', occurredAt: at('2026-05-09T00:00:00Z') })
        );
        await fixture.writer.put(
          buildEvent({ eventId: 'd', occurredAt: at('2026-05-10T00:00:00Z') })
        );

        const range = await fixture.reader.list({
          from: '2026-05-05T00:00:00.000Z',
          to: '2026-05-09T00:00:00.000Z',
        });
        expect(range.items.map((e) => e.eventId)).toEqual(['c', 'b']);

        const fromOnly = await fixture.reader.list({ from: '2026-05-09T00:00:00.000Z' });
        expect(fromOnly.items.map((e) => e.eventId)).toEqual(['d', 'c']);

        const toOnly = await fixture.reader.list({ to: '2026-05-01T00:00:00.000Z' });
        expect(toOnly.items.map((e) => e.eventId)).toEqual(['a']);
      });

      it('ミリ秒を省いた表記の from / to でも境界の時刻を含める', async () => {
        await fixture.writer.put(
          buildEvent({ eventId: 'a', occurredAt: at('2026-05-05T00:00:00Z') })
        );

        const result = await fixture.reader.list({
          from: '2026-05-05T00:00:00Z',
          to: '2026-05-05T00:00:00Z',
        });

        expect(result.items.map((e) => e.eventId)).toEqual(['a']);
      });

      it('from が to より後なら例外', async () => {
        await expect(
          fixture.reader.list({ from: '2026-05-31T00:00:00Z', to: '2026-05-01T00:00:00Z' })
        ).rejects.toThrow('from は to よりも前の時刻');
      });

      it('limit と cursor で全件を重複なく順に辿れる', async () => {
        for (let day = 1; day <= 5; day++) {
          await fixture.writer.put(
            buildEvent({ eventId: `evt-${day}`, occurredAt: at(`2026-05-0${day}T00:00:00Z`) })
          );
        }

        const collected: string[] = [];
        let cursor: string | undefined;
        do {
          const page = await fixture.reader.list({ limit: 2, cursor });
          expect(page.items.length).toBeLessThanOrEqual(2);
          collected.push(...page.items.map((e) => e.eventId));
          cursor = page.nextCursor ?? undefined;
        } while (cursor);

        expect(collected).toEqual(['evt-5', 'evt-4', 'evt-3', 'evt-2', 'evt-1']);
      });
    });

    describe('旧形式のアイテム', () => {
      it('list で読める (ISO 文字列の occurredAt はミリ秒になる)', async () => {
        await fixture.putRawItem(buildLegacyItem());

        const result = await fixture.reader.list({});

        expect(result.items).toEqual([
          {
            eventId: 'legacy-1',
            serviceId: 'stock-tracker',
            source: 'application',
            severity: 'warning',
            title: '旧形式',
            message: '旧形式のメッセージ',
            context: '{}',
            occurredAt: at('2026-05-06T00:30:00.000Z'),
          },
        ]);
      });

      it('findById で読める', async () => {
        await fixture.putRawItem(buildLegacyItem());

        const found = await fixture.reader.findById(
          'legacy-1',
          at('2026-05-06T00:30:00.000Z'),
          'stock-tracker'
        );

        expect(found).toMatchObject({ eventId: 'legacy-1', title: '旧形式' });
      });

      it('新形式のアイテムと混在しても発生時刻の降順に並ぶ', async () => {
        await fixture.putRawItem(buildLegacyItem());
        await fixture.writer.put(buildEvent({ eventId: 'new-1' }));
        await fixture.putRawItem(
          buildLegacyItem({ eventId: 'legacy-2', occurredAt: '2026-05-06T02:00:00.000Z' })
        );

        const result = await fixture.reader.list({});

        expect(result.items.map((e) => e.eventId)).toEqual(['legacy-2', 'new-1', 'legacy-1']);
      });

      it('旧形式のアイテムも from / to の範囲で絞り込める', async () => {
        await fixture.putRawItem(buildLegacyItem());

        const inRange = await fixture.reader.list({ from: '2026-05-06T00:00:00.000Z' });
        const outOfRange = await fixture.reader.list({ from: '2026-05-06T01:00:00.000Z' });

        expect(inRange.items).toHaveLength(1);
        expect(outOfRange.items).toHaveLength(0);
      });
    });
  });
}
