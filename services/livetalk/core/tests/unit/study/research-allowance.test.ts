import { InMemorySingleTableStore } from '@nagiyu/aws';
import {
  STUDY_DAILY_RESEARCH_LIMIT_GLOBAL,
  STUDY_DAILY_RESEARCH_LIMIT_PER_USER,
} from '../../../src/constants.js';
import { InMemoryStudyUsageRepository } from '../../../src/repositories/in-memory-study-usage.repository.js';
import {
  computePerCharacterResearchLimit,
  createDailyResearchAllowance,
} from '../../../src/study/research-allowance.js';

describe('computePerCharacterResearchLimit', () => {
  it('勉強中が 1 人なら、その 1 人が上限をすべて使う', () => {
    expect(computePerCharacterResearchLimit(1, 20)).toBe(20);
  });

  it('勉強中が 2 人なら等分する', () => {
    expect(computePerCharacterResearchLimit(2, 20)).toBe(10);
  });

  it('端数は使わない', () => {
    expect(computePerCharacterResearchLimit(3, 20)).toBe(6);
    expect(computePerCharacterResearchLimit(21, 20)).toBe(0);
  });

  it('勉強中が 0 人なら 0', () => {
    expect(computePerCharacterResearchLimit(0, 20)).toBe(0);
  });

  it('上限の既定は定数', () => {
    expect(computePerCharacterResearchLimit(1)).toBe(STUDY_DAILY_RESEARCH_LIMIT_PER_USER);
  });
});

describe('createDailyResearchAllowance', () => {
  const makeRepo = () => new InMemoryStudyUsageRepository(new InMemorySingleTableStore());

  it('枠の回数まで使え、その次から使えない', async () => {
    const allowance = createDailyResearchAllowance({
      studyUsageRepo: makeRepo(),
      userId: 'u1',
      characterId: 'hiyori',
      limit: 2,
      now: () => new Date('2026-11-05T03:00:00Z'),
    });

    expect(await allowance.tryConsume()).toEqual({ ok: true });
    expect(await allowance.tryConsume()).toEqual({ ok: true });
    expect(await allowance.tryConsume()).toEqual({ ok: false, deniedBy: 'character' });
  });

  it('now を省略すると現在時刻で数える', async () => {
    const allowance = createDailyResearchAllowance({
      studyUsageRepo: makeRepo(),
      userId: 'u1',
      characterId: 'hiyori',
      limit: 1,
    });

    expect(await allowance.tryConsume()).toEqual({ ok: true });
    expect(await allowance.tryConsume()).toEqual({ ok: false, deniedBy: 'character' });
  });

  it('呼ぶたびに時刻を評価し、日をまたぐと枠が戻る', async () => {
    let nowMs = Date.parse('2026-11-05T14:59:59Z');
    const allowance = createDailyResearchAllowance({
      studyUsageRepo: makeRepo(),
      userId: 'u1',
      characterId: 'hiyori',
      limit: 1,
      now: () => new Date(nowMs),
    });

    expect(await allowance.tryConsume()).toEqual({ ok: true });
    expect(await allowance.tryConsume()).toEqual({ ok: false, deniedBy: 'character' });
    nowMs = Date.parse('2026-11-05T15:00:00Z');
    expect(await allowance.tryConsume()).toEqual({ ok: true });
  });

  it('全体の上限を渡すと、別の利用者との合計でも止まる', async () => {
    const repo = makeRepo();
    const make = (userId: string) =>
      createDailyResearchAllowance({
        studyUsageRepo: repo,
        userId,
        characterId: 'hiyori',
        limit: 5,
        globalLimit: 1,
        now: () => new Date('2026-11-05T03:00:00Z'),
      });

    expect(await make('u1').tryConsume()).toEqual({ ok: true });
    expect(await make('u2').tryConsume()).toEqual({ ok: false, deniedBy: 'global' });
  });

  it('利用者の合計の上限で断られたら、利用者の枠で断られたと返す', async () => {
    const allowance = createDailyResearchAllowance({
      studyUsageRepo: makeRepo(),
      userId: 'u1',
      characterId: 'hiyori',
      limit: 5,
      totalLimit: 1,
      now: () => new Date('2026-11-05T03:00:00Z'),
    });

    expect(await allowance.tryConsume()).toEqual({ ok: true });
    expect(await allowance.tryConsume()).toEqual({ ok: false, deniedBy: 'user' });
  });

  it('全体の上限の既定は定数', async () => {
    const repo = new InMemoryStudyUsageRepository(new InMemorySingleTableStore());
    const spy = jest.spyOn(repo, 'tryConsume');
    await createDailyResearchAllowance({
      studyUsageRepo: repo,
      userId: 'u1',
      characterId: 'hiyori',
      limit: 1,
    }).tryConsume();

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ globalLimit: STUDY_DAILY_RESEARCH_LIMIT_GLOBAL })
    );
  });
});
