import { createHmac } from 'node:crypto';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import { IP_DAILY_JOB_LIMIT, UsageService } from '../../../src/libs/usage.service.js';
import { USAGE_LIMITS } from '../../../src/libs/usage-plan.js';
import { InMemoryJobRepository } from '../../../src/repositories/in-memory-job.repository.js';
import type { Job, UsageRecord } from '../../../src/types.js';
import { InMemoryUsageRepository } from '../../../src/repositories/in-memory-usage.repository.js';
import type { UsageRepository } from '../../../src/repositories/usage.repository.interface.js';

// 日本時間 2026-11-05 12:00
const NOW = Date.UTC(2026, 10, 5, 3, 0, 0);

const createService = (
  repository: UsageRepository = new InMemoryUsageRepository(new InMemorySingleTableStore())
) => new UsageService(repository, { now: () => NOW, generateSalt: () => 'fixed-salt' });

describe('UsageService.consume', () => {
  it('AI ありで数え、数えた記録を返す', async () => {
    const service = createService();

    const result = await service.consume({ subject: 'USER#u1', tier: 'free', aiAnalysis: true });

    expect(result).toEqual({
      ok: true,
      record: {
        subject: 'USER#u1',
        month: '202611',
        kind: 'ai',
        noAiLimit: USAGE_LIMITS.free.noAiPerMonth,
      },
      limit: USAGE_LIMITS.free,
    });
  });

  it('AI なしを明示すれば AI なしで数える', async () => {
    const service = createService();

    const result = await service.consume({
      subject: 'USER#u1',
      tier: 'standard',
      aiAnalysis: false,
    });

    expect(result).toMatchObject({ ok: true, record: { kind: 'noAi' } });
  });

  it('省略時は AI ありで受け、AI ありの残りが 0 なら AI なしで受ける', async () => {
    const service = createService();

    const first = await service.consume({ subject: 'USER#u1', tier: 'free' });
    const second = await service.consume({ subject: 'USER#u1', tier: 'free' });

    expect(first).toMatchObject({ ok: true, record: { kind: 'ai' } });
    expect(second).toMatchObject({ ok: true, record: { kind: 'noAi' } });
  });

  it('未ログインは AI の上限が 0 のため、省略時は AI なしで受ける', async () => {
    const service = createService();

    const result = await service.consume({ subject: 'ANON#a1', tier: 'anonymous' });

    expect(result).toMatchObject({ ok: true, record: { kind: 'noAi' } });
  });

  it('AI ありを明示して残りが 0 なら断る', async () => {
    const service = createService();

    expect(
      await service.consume({ subject: 'ANON#a1', tier: 'anonymous', aiAnalysis: true })
    ).toEqual({ ok: false, code: 'AI_LIMIT_EXCEEDED' });
  });

  it('AI なしの上限に達したら断る', async () => {
    const service = createService();
    for (let i = 0; i < USAGE_LIMITS.anonymous.noAiPerMonth; i += 1) {
      await service.consume({ subject: 'ANON#a1', tier: 'anonymous', aiAnalysis: false });
    }

    expect(
      await service.consume({ subject: 'ANON#a1', tier: 'anonymous', aiAnalysis: false })
    ).toEqual({ ok: false, code: 'NO_AI_LIMIT_EXCEEDED' });
  });

  it('省略時に AI あり・なしの両方が尽きていれば AI なしの上限として断る', async () => {
    const service = createService();
    await service.consume({ subject: 'USER#u1', tier: 'free', aiAnalysis: true });
    for (let i = 0; i < USAGE_LIMITS.free.noAiPerMonth; i += 1) {
      await service.consume({ subject: 'USER#u1', tier: 'free', aiAnalysis: false });
    }

    expect(await service.consume({ subject: 'USER#u1', tier: 'free' })).toEqual({
      ok: false,
      code: 'NO_AI_LIMIT_EXCEEDED',
    });
  });

  it('申告された長さが上限を超えていれば数えずに断る。申告が無ければ通す', async () => {
    const repository = new InMemoryUsageRepository(new InMemorySingleTableStore());
    const service = createService(repository);
    const tooLong = USAGE_LIMITS.anonymous.maxDurationSec + 1;

    expect(
      await service.consume({ subject: 'ANON#a1', tier: 'anonymous', durationSec: tooLong })
    ).toEqual({ ok: false, code: 'DURATION_LIMIT_EXCEEDED' });
    expect(await repository.getCounts('ANON#a1', '202611')).toEqual({ ai: 0, noAi: 0 });

    expect(
      await service.consume({
        subject: 'ANON#a1',
        tier: 'anonymous',
        durationSec: USAGE_LIMITS.anonymous.maxDurationSec,
      })
    ).toMatchObject({ ok: true });
    expect(await service.consume({ subject: 'ANON#a2', tier: 'anonymous' })).toMatchObject({
      ok: true,
    });
  });

  describe('IP の補助の上限', () => {
    it('日ごとの塩を鍵にした HMAC を保存し、IP をそのまま保存しない', async () => {
      const store = new InMemorySingleTableStore();
      const service = createService(new InMemoryUsageRepository(store));

      await service.consume({ subject: 'ANON#a1', tier: 'anonymous', ip: '203.0.113.7' });

      const expectedHash = createHmac('sha256', 'fixed-salt').update('203.0.113.7').digest('hex');
      const items = store.scanAll();
      expect(items.find((item) => item.PK === 'USAGE_IP#20261105')?.SK).toBe(`IP#${expectedHash}`);
      expect(JSON.stringify(items)).not.toContain('203.0.113.7');
    });

    it('同じ IP の 1 日の上限を超えると断り、数えた 1 回を戻す', async () => {
      const repository = new InMemoryUsageRepository(new InMemorySingleTableStore());
      const service = createService(repository);
      // 匿名 ID ごとの上限に当たらないよう、別の匿名 ID で申し込む
      for (let i = 0; i < IP_DAILY_JOB_LIMIT; i += 1) {
        const result = await service.consume({
          subject: `ANON#a${i}`,
          tier: 'anonymous',
          ip: '203.0.113.7',
        });
        expect(result.ok).toBe(true);
      }

      const rejected = await service.consume({
        subject: 'ANON#extra',
        tier: 'anonymous',
        ip: '203.0.113.7',
      });

      expect(rejected).toEqual({ ok: false, code: 'IP_LIMIT_EXCEEDED' });
      expect(await repository.getCounts('ANON#extra', '202611')).toEqual({ ai: 0, noAi: 0 });
      expect(
        await service.consume({ subject: 'ANON#extra', tier: 'anonymous', ip: '198.51.100.1' })
      ).toMatchObject({ ok: true });
    });

    it('ログイン済みには IP の上限を使わない', async () => {
      const store = new InMemorySingleTableStore();
      const service = createService(new InMemoryUsageRepository(store));

      await service.consume({ subject: 'USER#u1', tier: 'free', ip: '203.0.113.7' });

      expect(store.scanAll().some((item) => String(item.PK).startsWith('USAGE_IP#'))).toBe(false);
    });

    it('IP が取れなければ IP の上限は使わない', async () => {
      const store = new InMemorySingleTableStore();
      const service = createService(new InMemoryUsageRepository(store));

      expect(await service.consume({ subject: 'ANON#a1', tier: 'anonymous' })).toMatchObject({
        ok: true,
      });
      expect(store.scanAll().some((item) => String(item.PK).startsWith('USAGE_IP#'))).toBe(false);
    });

    it('IP の確認で障害になったら、数えた 1 回を戻して例外を投げる', async () => {
      const repository = new InMemoryUsageRepository(new InMemorySingleTableStore());
      jest.spyOn(repository, 'getOrCreateDailySalt').mockRejectedValue(new Error('boom'));
      const service = createService(repository);

      await expect(
        service.consume({ subject: 'ANON#a1', tier: 'anonymous', ip: '203.0.113.7' })
      ).rejects.toThrow('boom');
      expect(await repository.getCounts('ANON#a1', '202611')).toEqual({ ai: 0, noAi: 0 });
    });

    it('戻す処理も失敗したときは元の例外を投げ、戻せなかったことを報告する', async () => {
      const repository = new InMemoryUsageRepository(new InMemorySingleTableStore());
      jest.spyOn(repository, 'getOrCreateDailySalt').mockRejectedValue(new Error('boom'));
      const releaseError = new Error('release failed');
      jest.spyOn(repository, 'release').mockRejectedValue(releaseError);
      const reportError = jest.fn().mockResolvedValue(undefined);
      const service = new UsageService(repository, { now: () => NOW, reportError });

      await expect(
        service.consume({ subject: 'ANON#a1', tier: 'anonymous', ip: '203.0.113.7' })
      ).rejects.toThrow('boom');
      expect(reportError).toHaveBeenCalledWith(
        'QuickClip 利用回数を戻せませんでした',
        releaseError
      );
    });

    it('報告先を渡さなくても、戻す処理の失敗で元の例外が変わらない', async () => {
      const repository = new InMemoryUsageRepository(new InMemorySingleTableStore());
      jest.spyOn(repository, 'getOrCreateDailySalt').mockRejectedValue(new Error('boom'));
      jest.spyOn(repository, 'release').mockRejectedValue(new Error('release failed'));

      await expect(
        createService(repository).consume({
          subject: 'ANON#a1',
          tier: 'anonymous',
          ip: '203.0.113.7',
        })
      ).rejects.toThrow('boom');
    });
  });

  it('日本時間で月が変わると回数が 0 に戻る', async () => {
    const repository = new InMemoryUsageRepository(new InMemorySingleTableStore());
    let nowMs = Date.UTC(2026, 10, 30, 14, 59, 59); // 11/30 23:59:59 JST
    const service = new UsageService(repository, { now: () => nowMs });
    for (let i = 0; i < USAGE_LIMITS.free.noAiPerMonth; i += 1) {
      await service.consume({ subject: 'USER#u1', tier: 'free', aiAnalysis: false });
    }
    expect(
      await service.consume({ subject: 'USER#u1', tier: 'free', aiAnalysis: false })
    ).toMatchObject({ ok: false });

    nowMs = Date.UTC(2026, 10, 30, 15, 0, 0); // 12/1 00:00:00 JST

    expect(
      await service.consume({ subject: 'USER#u1', tier: 'free', aiAnalysis: false })
    ).toMatchObject({ ok: true, record: { month: '202612' } });
  });
});

describe('UsageService の取り消しと取得', () => {
  it('release は同じ主体・月・種類の回数を戻す', async () => {
    const repository = new InMemoryUsageRepository(new InMemorySingleTableStore());
    const service = createService(repository);
    const consumed = await service.consume({ subject: 'USER#u1', tier: 'free', aiAnalysis: true });
    if (!consumed.ok) {
      throw new Error('数えられるはず');
    }

    await service.release(consumed.record);

    expect(await repository.getCounts('USER#u1', '202611')).toEqual({ ai: 0, noAi: 0 });
  });

  describe('moveToNoAi', () => {
    it('AI ありを戻し、AI なしを数える', async () => {
      const repository = new InMemoryUsageRepository(new InMemorySingleTableStore());
      const service = createService(repository);
      const consumed = await service.consume({
        subject: 'USER#u1',
        tier: 'free',
        aiAnalysis: true,
      });
      if (!consumed.ok) {
        throw new Error('数えられるはず');
      }

      const moved = await service.moveToNoAi(consumed.record);

      expect(moved).toEqual({ ...consumed.record, kind: 'noAi' });
      expect(await repository.getCounts('USER#u1', '202611')).toEqual({ ai: 0, noAi: 1 });
    });

    it('AI なしの上限に達していれば、AI ありを戻すだけにする', async () => {
      const repository = new InMemoryUsageRepository(new InMemorySingleTableStore());
      const service = createService(repository);
      const consumed = await service.consume({
        subject: 'USER#u1',
        tier: 'free',
        aiAnalysis: true,
      });
      for (let i = 0; i < USAGE_LIMITS.free.noAiPerMonth; i += 1) {
        await service.consume({ subject: 'USER#u1', tier: 'free', aiAnalysis: false });
      }
      if (!consumed.ok) {
        throw new Error('数えられるはず');
      }

      expect(await service.moveToNoAi(consumed.record)).toBeUndefined();
      expect(await repository.getCounts('USER#u1', '202611')).toEqual({
        ai: 0,
        noAi: USAGE_LIMITS.free.noAiPerMonth,
      });
    });
  });

  describe('ジョブの記録に従った戻しと付け替え', () => {
    const setup = async (): Promise<{
      repository: InMemoryUsageRepository;
      service: UsageService;
      jobRepository: InMemoryJobRepository;
      job: Job;
    }> => {
      const store = new InMemorySingleTableStore();
      const repository = new InMemoryUsageRepository(store);
      const service = createService(repository);
      const jobRepository = new InMemoryJobRepository(store);
      const consumed = await service.consume({
        subject: 'USER#u1',
        tier: 'free',
        aiAnalysis: true,
      });
      if (!consumed.ok) {
        throw new Error('数えられるはず');
      }
      const job = await jobRepository.create({
        jobId: 'job-1',
        originalFileName: 'a.mp4',
        fileSize: 1,
        createdAt: NOW,
        expiresAt: NOW + 1000,
        usage: consumed.record,
      });
      return { repository, service, jobRepository, job };
    };

    it('releaseForJob は記録された 1 回を戻し、戻し済みの印を付ける', async () => {
      const { repository, service, jobRepository, job } = await setup();

      expect(await service.releaseForJob(job, jobRepository)).toBe(true);

      expect(await repository.getCounts('USER#u1', '202611')).toEqual({ ai: 0, noAi: 0 });
      expect((await jobRepository.getById('job-1'))?.usageReleased).toBe(true);
    });

    it('releaseForJob は 2 回目以降 (同時の呼び出しを含む) では戻さない', async () => {
      const { repository, service, jobRepository, job } = await setup();
      const releaseSpy = jest.spyOn(repository, 'release');

      const results = await Promise.all([
        service.releaseForJob(job, jobRepository),
        service.releaseForJob(job, jobRepository),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      expect(releaseSpy).toHaveBeenCalledTimes(1);
    });

    it('releaseForJob は記録の無いジョブでは何もしない', async () => {
      const { service, jobRepository, job } = await setup();

      expect(await service.releaseForJob({ ...job, usage: undefined }, jobRepository)).toBe(false);
      expect((await jobRepository.getById('job-1'))?.usageReleased).toBeUndefined();
    });

    it('switchToNoAiForJob は AI ありを戻して AI なしを数え、ジョブの記録も AI なしにする', async () => {
      const { repository, service, jobRepository, job } = await setup();

      await service.switchToNoAiForJob(job, jobRepository);

      expect(await repository.getCounts('USER#u1', '202611')).toEqual({ ai: 0, noAi: 1 });
      expect((await jobRepository.getById('job-1'))?.usage?.kind).toBe('noAi');
    });

    it('switchToNoAiForJob は二重に付け替えない', async () => {
      const { repository, service, jobRepository, job } = await setup();

      await Promise.all([
        service.switchToNoAiForJob(job, jobRepository),
        service.switchToNoAiForJob(job, jobRepository),
      ]);
      await service.switchToNoAiForJob(job, jobRepository);

      expect(await repository.getCounts('USER#u1', '202611')).toEqual({ ai: 0, noAi: 1 });
    });

    it('付け替えたあとの戻しは、実際に数えている AI なしを戻す', async () => {
      const { repository, service, jobRepository, job } = await setup();
      await service.switchToNoAiForJob(job, jobRepository);

      const switched = (await jobRepository.getById('job-1')) as Job;
      await service.releaseForJob(switched, jobRepository);

      expect(await repository.getCounts('USER#u1', '202611')).toEqual({ ai: 0, noAi: 0 });
    });

    it('AI なしの上限に達していれば AI ありを戻すだけにし、ジョブは戻し済みになる', async () => {
      const { repository, service, jobRepository, job } = await setup();
      for (let i = 0; i < USAGE_LIMITS.free.noAiPerMonth; i += 1) {
        await service.consume({ subject: 'USER#u1', tier: 'free', aiAnalysis: false });
      }

      await service.switchToNoAiForJob(job, jobRepository);

      expect(await repository.getCounts('USER#u1', '202611')).toEqual({
        ai: 0,
        noAi: USAGE_LIMITS.free.noAiPerMonth,
      });
      expect((await jobRepository.getById('job-1'))?.usageReleased).toBe(true);
    });

    it('switchToNoAiForJob は AI なしで数えたジョブや記録の無いジョブでは何もしない', async () => {
      const { repository, service, jobRepository, job } = await setup();
      const releaseSpy = jest.spyOn(repository, 'release');

      await service.switchToNoAiForJob(
        { ...job, usage: { ...(job.usage as UsageRecord), kind: 'noAi' } },
        jobRepository
      );
      await service.switchToNoAiForJob({ ...job, usage: undefined }, jobRepository);

      expect(releaseSpy).not.toHaveBeenCalled();
    });
  });

  it('getUsage は段・上限・使用済み・残りを返す', async () => {
    const service = createService();
    await service.consume({ subject: 'USER#u1', tier: 'free', aiAnalysis: true });
    await service.consume({ subject: 'USER#u1', tier: 'free', aiAnalysis: false });

    expect(await service.getUsage('USER#u1', 'free')).toEqual({
      month: '202611',
      tier: 'free',
      limits: USAGE_LIMITS.free,
      used: { ai: 1, noAi: 1 },
      remaining: { ai: 0, noAi: USAGE_LIMITS.free.noAiPerMonth - 1 },
    });
  });

  it('getUsage の残りは 0 未満にならない', async () => {
    const repository = new InMemoryUsageRepository(new InMemorySingleTableStore());
    jest.spyOn(repository, 'getCounts').mockResolvedValue({ ai: 99, noAi: 99 });
    const service = createService(repository);

    expect((await service.getUsage('USER#u1', 'free')).remaining).toEqual({ ai: 0, noAi: 0 });
  });
});
