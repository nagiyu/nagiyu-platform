import {
  findLastUserMessageAt,
  isStudyPaused,
  resolveLastUserMessageAt,
} from '../../../src/study/active-window.js';
import { STUDY_PAUSE_AFTER_HOURS } from '../../../src/constants.js';
import type { MessageRepository } from '../../../src/repositories/message.repository.interface.js';

const PAUSE_MS = STUDY_PAUSE_AFTER_HOURS * 60 * 60 * 1000;
const NOW = new Date('2026-06-10T05:00:00Z');

describe('isStudyPaused', () => {
  it('停止期間は 3 日 (72 時間)', () => {
    expect(STUDY_PAUSE_AFTER_HOURS).toBe(72);
  });

  it('発話が一度もなければ止まっている', () => {
    expect(isStudyPaused(undefined, NOW)).toBe(true);
  });

  it('ちょうど 3 日たったら止まっている', () => {
    expect(isStudyPaused(NOW.getTime() - PAUSE_MS, NOW)).toBe(true);
  });

  it('3 日に 1 ミリ秒足りなければ止まっていない', () => {
    expect(isStudyPaused(NOW.getTime() - PAUSE_MS + 1, NOW)).toBe(false);
  });

  it('3 日を超えていれば止まっている', () => {
    expect(isStudyPaused(NOW.getTime() - PAUSE_MS - 1, NOW)).toBe(true);
  });

  it('直前に話していれば止まっていない', () => {
    expect(isStudyPaused(NOW.getTime(), NOW)).toBe(false);
  });
});

describe('findLastUserMessageAt', () => {
  it('空なら undefined', () => {
    expect(findLastUserMessageAt([])).toBeUndefined();
  });

  it('ユーザー発話の最大の createdAt を返す (並び順に依存しない)', () => {
    expect(
      findLastUserMessageAt([
        { role: 'user', createdAt: 300 },
        { role: 'user', createdAt: 100 },
        { role: 'user', createdAt: 200 },
      ])
    ).toBe(300);
  });

  it('アシスタントの発話は含めない', () => {
    expect(
      findLastUserMessageAt([
        { role: 'user', createdAt: 100 },
        { role: 'assistant', createdAt: 900 },
      ])
    ).toBe(100);
  });

  it('アシスタントの発話しかなければ undefined', () => {
    expect(findLastUserMessageAt([{ role: 'assistant', createdAt: 900 }])).toBeUndefined();
  });
});

describe('resolveLastUserMessageAt', () => {
  it('停止期間の始点以降だけを読み、ユーザーの最後の発話を返す', async () => {
    const listSince = jest.fn().mockResolvedValue([
      { role: 'user', createdAt: 100 },
      { role: 'assistant', createdAt: 200 },
    ]);
    const repo = { listSince } as unknown as MessageRepository;

    const result = await resolveLastUserMessageAt(repo, 'u1', 'hiyori', NOW);

    expect(listSince).toHaveBeenCalledWith('u1', 'hiyori', NOW.getTime() - PAUSE_MS);
    expect(result).toBe(100);
  });

  it('期間内に発話がなければ undefined', async () => {
    const repo = { listSince: jest.fn().mockResolvedValue([]) } as unknown as MessageRepository;
    expect(await resolveLastUserMessageAt(repo, 'u1', 'hiyori', NOW)).toBeUndefined();
  });
});
