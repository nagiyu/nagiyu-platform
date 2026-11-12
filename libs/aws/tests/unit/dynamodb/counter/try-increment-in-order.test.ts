import { InMemoryUsageCounter } from '../../../../src/dynamodb/counter/in-memory-usage-counter';
import { tryIncrementInOrder } from '../../../../src/dynamodb/counter/try-increment-in-order';
import type { UsageCounterIncrementInput } from '../../../../src/dynamodb/counter/usage-counter.interface';
import { InMemorySingleTableStore } from '../../../../src/dynamodb/in-memory/single-table-store';

const key = { PK: 'COUNT#a', SK: 'PERIOD#1' };
const base = { key, ttlSec: 1000, itemType: 'COUNTER' };
const first: UsageCounterIncrementInput = { ...base, attribute: 'First', limit: 5 };
const second: UsageCounterIncrementInput = { ...base, attribute: 'Second', limit: 5 };
const third: UsageCounterIncrementInput = { ...base, attribute: 'Third', limit: 5 };

describe('tryIncrementInOrder', () => {
  let counter: InMemoryUsageCounter;
  const read = (): Promise<Record<string, number>> =>
    counter.read(key, ['First', 'Second', 'Third']);

  beforeEach(() => {
    counter = new InMemoryUsageCounter(new InMemorySingleTableStore());
  });

  it('全段を通ったら数えたままにして ok を返す', async () => {
    const result = await tryIncrementInOrder(counter, [first, second, third]);

    expect(result).toEqual({ ok: true });
    expect(await read()).toEqual({ First: 1, Second: 1, Third: 1 });
  });

  it('入力を返す関数も渡せ、前の段が通ったあとに呼ばれる', async () => {
    const order: string[] = [];
    const makeSecond = jest.fn(async () => {
      order.push(`second:${(await read()).First}`);
      return second;
    });

    const result = await tryIncrementInOrder(counter, [first, makeSecond]);

    expect(result).toEqual({ ok: true });
    expect(order).toEqual(['second:1']);
  });

  it('段が空なら何もせず ok を返す', async () => {
    expect(await tryIncrementInOrder(counter, [])).toEqual({ ok: true });
  });

  it('途中の段で断られたら、通った段を戻し、断られた段の位置を返す', async () => {
    await counter.tryIncrement({ ...second, limit: 1 });

    const result = await tryIncrementInOrder(counter, [first, { ...second, limit: 1 }, third]);

    expect(result).toEqual({ ok: false, deniedIndex: 1 });
    expect(await read()).toEqual({ First: 0, Second: 1, Third: 0 });
  });

  it('先頭の段で断られたら、何も戻さず 0 を返す', async () => {
    const makeSecond = jest.fn(async () => second);

    const result = await tryIncrementInOrder(counter, [{ ...first, limit: 0 }, makeSecond]);

    expect(result).toEqual({ ok: false, deniedIndex: 0 });
    expect(makeSecond).not.toHaveBeenCalled();
  });

  it('途中の段が例外になったら、通った段を戻して元の例外を投げ直す', async () => {
    const boom = new Error('boom');
    jest.spyOn(counter, 'tryIncrement').mockImplementation(async (input) => {
      if (input.attribute === 'Second') throw boom;
      return InMemoryUsageCounter.prototype.tryIncrement.call(counter, input);
    });

    await expect(tryIncrementInOrder(counter, [first, second, third])).rejects.toBe(boom);
    expect(await read()).toEqual({ First: 0, Second: 0, Third: 0 });
  });

  it('入力を作る関数が例外になったら、通った段を戻して元の例外を投げ直す', async () => {
    const boom = new Error('make failed');

    await expect(
      tryIncrementInOrder(counter, [
        first,
        async () => {
          throw boom;
        },
      ])
    ).rejects.toBe(boom);
    expect(await read()).toEqual({ First: 0, Second: 0, Third: 0 });
  });

  it('通った段を逆順に戻す', async () => {
    const decrementOrder: string[] = [];
    const original = counter.decrement.bind(counter);
    jest.spyOn(counter, 'decrement').mockImplementation(async (input) => {
      decrementOrder.push(input.attribute);
      await original(input);
    });

    await tryIncrementInOrder(counter, [first, second, { ...third, limit: 0 }]);

    expect(decrementOrder).toEqual(['Second', 'First']);
  });

  it('戻しが失敗したらコールバックに渡し、断りの結果を返す', async () => {
    const rollbackError = new Error('decrement failed');
    jest.spyOn(counter, 'decrement').mockRejectedValue(rollbackError);
    const onRollbackError = jest.fn();

    const result = await tryIncrementInOrder(counter, [first, second, { ...third, limit: 0 }], {
      onRollbackError,
    });

    expect(result).toEqual({ ok: false, deniedIndex: 2 });
    expect(onRollbackError).toHaveBeenCalledTimes(2);
    expect(onRollbackError).toHaveBeenNthCalledWith(1, rollbackError, second);
    expect(onRollbackError).toHaveBeenNthCalledWith(2, rollbackError, first);
  });

  it('戻しが失敗しても、元の例外を投げる', async () => {
    const boom = new Error('boom');
    jest.spyOn(counter, 'decrement').mockRejectedValue(new Error('decrement failed'));
    const onRollbackError = jest.fn();

    await expect(
      tryIncrementInOrder(
        counter,
        [
          first,
          async () => {
            throw boom;
          },
        ],
        { onRollbackError }
      )
    ).rejects.toBe(boom);
    expect(onRollbackError).toHaveBeenCalledTimes(1);
  });

  it('コールバック自体が失敗しても、元の結果を返し、残りの戻しも続ける', async () => {
    const original = counter.decrement.bind(counter);
    jest.spyOn(counter, 'decrement').mockImplementation(async (input) => {
      if (input.attribute === 'Second') throw new Error('decrement failed');
      await original(input);
    });
    const onRollbackError = jest.fn().mockRejectedValue(new Error('report failed'));

    const result = await tryIncrementInOrder(counter, [first, second, { ...third, limit: 0 }], {
      onRollbackError,
    });

    expect(result).toEqual({ ok: false, deniedIndex: 2 });
    expect((await read()).First).toBe(0);
  });

  it('コールバックを渡さなくても、戻しの失敗で元の結果が変わらない', async () => {
    jest.spyOn(counter, 'decrement').mockRejectedValue(new Error('decrement failed'));

    expect(await tryIncrementInOrder(counter, [first, { ...second, limit: 0 }])).toEqual({
      ok: false,
      deniedIndex: 1,
    });
  });
});
