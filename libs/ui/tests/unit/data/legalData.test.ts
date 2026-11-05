import { termSections } from '../../../src/data/termsOfServiceData';
import { privacyPolicySections } from '../../../src/data/privacyPolicyData';

const flatten = (sections: typeof termSections) =>
  JSON.stringify(sections.map((s) => [s.title, s.contents]));

describe('利用規約データ', () => {
  it('利用料金の条が有料プランの条に置き換わり、位置は 4 番目のまま', () => {
    expect(termSections[3].title).toBe('有料プラン');
    expect(termSections.some((s) => s.title === '利用料金および支払方法')).toBe(false);
    expect(termSections[3].contents).toHaveLength(7);
  });

  it('遅延損害金の項が無い', () => {
    expect(flatten(termSections)).not.toContain('遅延損害金');
  });
});

describe('プライバシーポリシーデータ', () => {
  it('収集方法の例示からカード番号・口座番号が外れている', () => {
    const section = privacyPolicySections.find((s) => s.title === '個人情報の収集方法');
    expect(section?.contents[0].mainContent).not.toContain('クレジットカード番号');
    expect(section?.contents[0].mainContent).not.toContain('銀行口座番号');
  });

  it('決済に関する情報の取り扱いの条が第三者提供の直前にあり、Stripe のリンクを持つ', () => {
    const index = privacyPolicySections.findIndex((s) => s.title === '決済に関する情報の取り扱い');
    expect(index).toBeGreaterThan(-1);
    expect(privacyPolicySections[index + 1].title).toBe('個人情報の第三者提供');
    expect(privacyPolicySections[index].contents[2].link).toBe('https://stripe.com/jp/privacy');
  });
});
