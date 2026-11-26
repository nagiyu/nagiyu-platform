import { buildStudyBadge } from '@/lib/study/study-badge';

const AUTH_URL = 'https://auth.example.com';

describe('buildStudyBadge', () => {
  it('hidden は札を出さない', () => {
    expect(buildStudyBadge({ state: 'hidden' }, AUTH_URL)).toBeNull();
  });

  it('お試し中は残り日数の文言で、押せない', () => {
    expect(buildStudyBadge({ state: 'trial', remainingDays: 3 }, AUTH_URL)).toEqual({
      label: 'お試し中 あと 3 日',
      color: 'neutral',
    });
  });

  it('お試しのあとは注意の色で、プランの画面へのリンクを持つ', () => {
    expect(buildStudyBadge({ state: 'ended' }, AUTH_URL)).toEqual({
      label: '勉強はお休み中',
      color: 'warning',
      href: 'https://auth.example.com/plans',
    });
  });

  it('auth の URL が空なら、リンクを持たない', () => {
    expect(buildStudyBadge({ state: 'ended' }, '')).toEqual({
      label: '勉強はお休み中',
      color: 'warning',
    });
  });
});
