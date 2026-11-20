import { buildConsentNotice, selectRevisionsSince } from '@/lib/consent/notice';
import type { LegalRevision } from '@/lib/legal/revisions';

const required = { terms: '1.1.0', privacy: '1.1.0' };
const recorded = (version: string) => ({ version });

describe('selectRevisionsSince', () => {
  const revisions: LegalRevision[] = [
    { version: '1.0.0', effectiveDate: 'a', summary: ['制定'] },
    { version: '1.1.0', effectiveDate: 'b', summary: ['x'] },
    { version: '1.2.0', effectiveDate: 'c', summary: ['y'] },
  ];

  it('記録した版より後の版を古い順に返す', () => {
    expect(selectRevisionsSince(revisions, '1.0.0', '1.2.0').map((r) => r.version)).toEqual([
      '1.1.0',
      '1.2.0',
    ]);
  });

  it('記録した版が履歴に無ければ現行の版だけを返す', () => {
    expect(selectRevisionsSince(revisions, '0.9.0', '1.2.0').map((r) => r.version)).toEqual([
      '1.2.0',
    ]);
  });
});

describe('buildConsentNotice', () => {
  it('取得できなければ初回', () => {
    expect(buildConsentNotice(null)).toEqual({ kind: 'initial' });
  });

  it('記録が無ければ初回', () => {
    expect(buildConsentNotice({ requiredVersions: required, current: null })).toEqual({
      kind: 'initial',
    });
    expect(buildConsentNotice({ requiredVersions: required, current: {} })).toEqual({
      kind: 'initial',
    });
  });

  it('両方の文書が変わっていれば改定として要点と施行日を返す', () => {
    const notice = buildConsentNotice({
      requiredVersions: required,
      current: {
        termsAgreed: recorded('1.0.0'),
        privacyAgreed: recorded('1.0.0'),
        ageVerified: { value: true },
      },
    });
    expect(notice.kind).toBe('revision');
    if (notice.kind !== 'revision') return;
    expect(notice.ageRequired).toBe(false);
    expect(notice.documents.map((d) => d.key)).toEqual(['terms', 'privacy']);
    expect(notice.documents[0]).toMatchObject({
      version: '1.1.0',
      effectiveDate: '2026年11月15日',
      href: '/legal/terms',
    });
    expect(notice.documents[0].summary.length).toBeGreaterThan(0);
  });

  it('片方だけ変わっていれば、その文書だけを返す', () => {
    const notice = buildConsentNotice({
      requiredVersions: required,
      current: {
        termsAgreed: recorded('1.1.0'),
        privacyAgreed: recorded('1.0.0'),
        ageVerified: { value: true },
      },
    });
    expect(notice.kind === 'revision' && notice.documents.map((d) => d.key)).toEqual(['privacy']);
  });

  it('年齢の記録が無ければ申告を求める', () => {
    const notice = buildConsentNotice({
      requiredVersions: required,
      current: { termsAgreed: recorded('1.0.0'), privacyAgreed: recorded('1.0.0') },
    });
    expect(notice.kind === 'revision' && notice.ageRequired).toBe(true);
  });

  it('片方の記録だけ欠けていれば、その文書は現行の版の要点を出す', () => {
    const notice = buildConsentNotice({
      requiredVersions: required,
      current: { termsAgreed: recorded('1.1.0') },
    });
    expect(notice.kind).toBe('revision');
    if (notice.kind !== 'revision') return;
    expect(notice.documents.map((d) => d.key)).toEqual(['privacy']);
    expect(notice.documents[0].summary).toEqual(
      expect.arrayContaining([expect.stringContaining('OpenAI')])
    );
  });

  it('現行の版が履歴に無ければ施行日と要点は空にする', () => {
    const notice = buildConsentNotice({
      requiredVersions: { terms: '9.9.9', privacy: '1.1.0' },
      current: {
        termsAgreed: recorded('0.9.0'),
        privacyAgreed: recorded('1.1.0'),
        ageVerified: { value: true },
      },
    });
    expect(notice.kind === 'revision' && notice.documents[0]).toMatchObject({
      version: '9.9.9',
      effectiveDate: null,
      summary: [],
    });
  });

  it('文書が変わっていなければ初回の扱い', () => {
    expect(
      buildConsentNotice({
        requiredVersions: required,
        current: { termsAgreed: recorded('1.1.0'), privacyAgreed: recorded('1.1.0') },
      })
    ).toEqual({ kind: 'initial' });
  });
});
