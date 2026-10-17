/**
 * InMemoryErrorEventWriter の単体テスト
 */

import type { ErrorEvent } from '@nagiyu/common';
import { EntityAlreadyExistsError } from '../../../src/dynamodb/errors.js';
import { InMemorySingleTableStore } from '../../../src/dynamodb/in-memory/single-table-store.js';
import { InMemoryErrorEventWriter } from '../../../src/error-events/in-memory-writer.js';

const sampleEvent = (overrides: Partial<ErrorEvent> = {}): ErrorEvent => ({
  eventId: 'evt-1',
  serviceId: 'stock-tracker',
  source: 'cloudwatch-alarm',
  severity: 'error',
  title: 'sample',
  message: 'sample message',
  context: '{}',
  occurredAt: Date.parse('2026-05-06T00:00:00.000Z'),
  ...overrides,
});

describe('InMemoryErrorEventWriter', () => {
  let writer: InMemoryErrorEventWriter;

  beforeEach(() => {
    writer = new InMemoryErrorEventWriter();
  });

  it('put したイベントを getRecords で取得できる', async () => {
    const event = sampleEvent();
    await writer.put(event);

    const records = writer.getRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(event);
  });

  it('複数 put すると書き込み順で保持される', async () => {
    await writer.put(sampleEvent({ eventId: 'a' }));
    await writer.put(sampleEvent({ eventId: 'b' }));
    await writer.put(sampleEvent({ eventId: 'c' }));

    const records = writer.getRecords();
    expect(records.map((r) => r.eventId)).toEqual(['a', 'b', 'c']);
  });

  it('内部状態を変更しても getRecords の戻り値は影響を受けない', async () => {
    await writer.put(sampleEvent());
    const snapshot = writer.getRecords();

    await writer.put(sampleEvent({ eventId: 'evt-2' }));

    expect(snapshot).toHaveLength(1);
    expect(writer.getRecords()).toHaveLength(2);
  });

  it('put された ErrorEvent はコピーされ、後続の変更の影響を受けない', async () => {
    const event = sampleEvent();
    await writer.put(event);

    event.title = 'mutated';

    expect(writer.getRecords()[0].title).toBe('sample');
  });

  it('同じ eventId・serviceId・occurredAt を再投入すると拒否する', async () => {
    await writer.put(sampleEvent());

    await expect(writer.put(sampleEvent())).rejects.toThrow(EntityAlreadyExistsError);
  });

  it('必須項目が空のイベントは拒否する', async () => {
    await expect(writer.put(sampleEvent({ eventId: '' }))).rejects.toThrow(
      'eventId は空文字にできません'
    );
    await expect(writer.put(sampleEvent({ occurredAt: Number.NaN }))).rejects.toThrow(
      'occurredAt は有限の数値'
    );
    expect(writer.getRecords()).toHaveLength(0);
  });

  it('共有ストアには新形式の Item を書く', async () => {
    const store = new InMemorySingleTableStore();
    await new InMemoryErrorEventWriter(store).put(sampleEvent());

    const item = store.get('ERROR_EVENT#stock-tracker', 'OCCURRED#2026-05-06T00:00:00.000Z#evt-1');
    expect(item).toMatchObject({
      EventID: 'evt-1',
      OccurredAt: Date.parse('2026-05-06T00:00:00.000Z'),
    });
    expect(item).not.toHaveProperty('ttl');
  });

  it('reset は共有ストア上の他の Item を消さない', async () => {
    const store = new InMemorySingleTableStore();
    store.putByKey({ PK: 'OTHER', SK: 'x' }, { PK: 'OTHER', SK: 'x' });
    const own = new InMemoryErrorEventWriter(store);
    await own.put(sampleEvent());

    own.reset();

    expect(store.size()).toBe(1);
  });

  it('reset で内部状態をクリアできる', async () => {
    await writer.put(sampleEvent());
    writer.reset();
    expect(writer.getRecords()).toHaveLength(0);
  });
});
