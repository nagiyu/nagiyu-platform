import { createPhaseTimer } from '../../../src/observability/timer.js';

describe('createPhaseTimer', () => {
  it('start/end で経過時間（ms）を返す', async () => {
    const timer = createPhaseTimer();
    timer.start('phase1');
    await new Promise((r) => setTimeout(r, 30));
    const elapsed = timer.end('phase1');
    expect(elapsed).toBeGreaterThanOrEqual(20);
    expect(elapsed).toBeLessThan(500);
  });

  it('end を先に呼んだ場合は 0 を返す', () => {
    const timer = createPhaseTimer();
    const elapsed = timer.end('notStarted');
    expect(elapsed).toBe(0);
  });

  it('elapsedMs は計測済みフェーズの値を返す', async () => {
    const timer = createPhaseTimer();
    timer.start('p');
    await new Promise((r) => setTimeout(r, 10));
    timer.end('p');
    const ms = timer.elapsedMs('p');
    expect(ms).toBeDefined();
    expect(ms!).toBeGreaterThanOrEqual(0);
  });

  it('elapsedMs は未計測フェーズに対して undefined を返す', () => {
    const timer = createPhaseTimer();
    expect(timer.elapsedMs('unknown')).toBeUndefined();
  });

  it('elapsedMs は start したが end していないフェーズに対して undefined を返す', () => {
    const timer = createPhaseTimer();
    timer.start('partial');
    expect(timer.elapsedMs('partial')).toBeUndefined();
  });

  it('複数フェーズを独立して計測できる', async () => {
    const timer = createPhaseTimer();
    timer.start('a');
    await new Promise((r) => setTimeout(r, 10));
    timer.start('b');
    await new Promise((r) => setTimeout(r, 10));
    timer.end('a');
    timer.end('b');
    const a = timer.elapsedMs('a');
    const b = timer.elapsedMs('b');
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!).toBeGreaterThan(b!);
  });
});
