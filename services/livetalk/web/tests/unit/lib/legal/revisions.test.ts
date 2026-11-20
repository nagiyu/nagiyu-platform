/**
 * @jest-environment node
 */
import { LIVETALK_PRIVACY_VERSION, LIVETALK_TERMS_VERSION } from '@nagiyu/livetalk-core';
import { privacyRevisions, termsRevisions } from '@/lib/legal/revisions';

describe('改定履歴', () => {
  it('利用規約の最新の版が同意の判定に使う版と一致する', () => {
    expect(termsRevisions[termsRevisions.length - 1].version).toBe(LIVETALK_TERMS_VERSION);
  });

  it('プライバシーポリシーの最新の版が同意の判定に使う版と一致する', () => {
    expect(privacyRevisions[privacyRevisions.length - 1].version).toBe(LIVETALK_PRIVACY_VERSION);
  });

  it.each([
    ['利用規約', termsRevisions],
    ['プライバシーポリシー', privacyRevisions],
  ])('%sの版は重複せず、どの版にも要点がある', (_name, revisions) => {
    expect(new Set(revisions.map((r) => r.version)).size).toBe(revisions.length);
    for (const revision of revisions) {
      expect(revision.summary.length).toBeGreaterThan(0);
    }
  });
});
