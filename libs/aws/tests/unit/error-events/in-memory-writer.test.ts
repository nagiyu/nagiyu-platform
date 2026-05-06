/**
 * InMemoryErrorEventWriter の単体テスト
 */

import type { ErrorEvent } from '@nagiyu/common';
import { InMemoryErrorEventWriter } from '../../../src/error-events/in-memory-writer.js';

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

  it('reset で内部状態をクリアできる', async () => {
    await writer.put(sampleEvent());
    writer.reset();
    expect(writer.getRecords()).toHaveLength(0);
  });
});
