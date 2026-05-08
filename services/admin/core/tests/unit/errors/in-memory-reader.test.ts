/**
 * InMemoryErrorEventReader の単体テスト
 */

import type { ErrorEvent } from '@nagiyu/common';
import { InMemoryErrorEventReader } from '../../../src/errors/in-memory-reader.js';

const sampleEvent = (overrides: Partial<ErrorEvent> = {}): ErrorEvent => ({
  eventId: 'evt-1',
  serviceId: 'stock-tracker',
  source: 'cloudwatch-alarm',
  severity: 'error',
  title: 'sample',
  message: 'sample message',
  context: '{}',
  occurredAt: '2026-05-06T00:00:00.000Z',
  ...overrides,
});

describe('InMemoryErrorEventReader', () => {
  let reader: InMemoryErrorEventReader;

  beforeEach(() => {
    reader = new InMemoryErrorEventReader();
  });

  it('list は put した順とは無関係に occurredAt 降順で返す', async () => {
    reader.put(sampleEvent({ eventId: 'a', occurredAt: '2026-05-06T00:00:00.000Z' }));
    reader.put(sampleEvent({ eventId: 'b', occurredAt: '2026-05-06T01:00:00.000Z' }));
    reader.put(sampleEvent({ eventId: 'c', occurredAt: '2026-05-05T23:00:00.000Z' }));

    const result = await reader.list({});
    expect(result.items.map((e) => e.eventId)).toEqual(['b', 'a', 'c']);
    expect(result.nextCursor).toBeNull();
  });

  it('serviceId で絞り込める', async () => {
    reader.put(sampleEvent({ eventId: 'a', serviceId: 'stock-tracker' }));
    reader.put(sampleEvent({ eventId: 'b', serviceId: 'admin' }));

    const result = await reader.list({ serviceId: 'stock-tracker' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].eventId).toBe('a');
  });

  it('from / to で期間絞り込みできる', async () => {
    reader.put(sampleEvent({ eventId: 'a', occurredAt: '2026-05-01T00:00:00.000Z' }));
    reader.put(sampleEvent({ eventId: 'b', occurredAt: '2026-05-05T00:00:00.000Z' }));
    reader.put(sampleEvent({ eventId: 'c', occurredAt: '2026-05-10T00:00:00.000Z' }));

    const result = await reader.list({
      from: '2026-05-04T00:00:00.000Z',
      to: '2026-05-09T00:00:00.000Z',
    });
    expect(result.items.map((e) => e.eventId)).toEqual(['b']);
  });

  it('limit + cursor でページングできる', async () => {
    for (let i = 0; i < 5; i++) {
      reader.put(
        sampleEvent({
          eventId: `evt-${i}`,
          occurredAt: `2026-05-0${i}T00:00:00.000Z`,
        })
      );
    }

    const first = await reader.list({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await reader.list({ limit: 2, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).not.toBeNull();

    const third = await reader.list({ limit: 2, cursor: second.nextCursor! });
    expect(third.items).toHaveLength(1);
    expect(third.nextCursor).toBeNull();
  });

  it('findById は eventId / occurredAt / serviceId 全一致で返す', async () => {
    const event = sampleEvent({ eventId: 'evt-1', serviceId: 's1' });
    reader.put(event);

    const found = await reader.findById('evt-1', event.occurredAt, 's1');
    expect(found).toEqual(event);
  });

  it('findById は不一致のとき null', async () => {
    reader.put(sampleEvent({ eventId: 'evt-1' }));
    expect(
      await reader.findById('missing', '2026-01-01T00:00:00.000Z', 'stock-tracker')
    ).toBeNull();
  });

  it('reset で状態をクリア', async () => {
    reader.put(sampleEvent());
    reader.reset();
    const result = await reader.list({});
    expect(result.items).toEqual([]);
  });
});
