import { privacyPolicySections } from '@nagiyu/ui';
import {
  DATA_HANDLING_PRIVACY_SECTION,
  quickClipPrivacySections,
  SECTION_TITLES,
  USAGE_LIMIT_PRIVACY_SECTION,
} from '@/lib/privacy-policy';

describe('quickClipPrivacySections', () => {
  it('共通の文面に、差し替え・挿入の位置を決める見出しが両方ある (無くなったら変更が効かない)', () => {
    const titles = privacyPolicySections.map((section) => section.title);

    expect(titles).toContain(SECTION_TITLES.COOKIE_SETTINGS);
    expect(titles).toContain(SECTION_TITLES.DATA_HANDLING);
  });

  it('「Cookieの設定について」の直後に利用回数の制限の節を足す', () => {
    const titles = quickClipPrivacySections.map((section) => section.title);
    const cookieIndex = titles.indexOf(SECTION_TITLES.COOKIE_SETTINGS);

    expect(titles[cookieIndex + 1]).toBe('さくっとクリップの利用回数の制限について');
  });

  it('「データの取り扱い」を、共通の文面ではなくこのサービスの内容に差し替える', () => {
    const sections = quickClipPrivacySections.filter(
      (section) => section.title === SECTION_TITLES.DATA_HANDLING
    );

    expect(sections).toEqual([DATA_HANDLING_PRIVACY_SECTION]);
    expect(JSON.stringify(sections)).not.toContain('サーバーに送信されることはありません');
    expect(JSON.stringify(sections)).toContain('OpenAI');
  });

  it('それ以外の節は共通の文面のまま、足した節の分だけ増える', () => {
    expect(quickClipPrivacySections).toHaveLength(privacyPolicySections.length + 1);
    const unchanged = quickClipPrivacySections.filter(
      (section) =>
        section !== USAGE_LIMIT_PRIVACY_SECTION && section !== DATA_HANDLING_PRIVACY_SECTION
    );
    expect(unchanged).toEqual(
      privacyPolicySections.filter((section) => section.title !== SECTION_TITLES.DATA_HANDLING)
    );
  });

  it('IP の説明は、日ごとに変わる値と組み合わせて変換し数日以内に削除すると述べる', () => {
    expect(USAGE_LIMIT_PRIVACY_SECTION.contents[1].mainContent).toBe(
      '同じ接続元からの過度な利用を防ぐため、アクセス元の IP アドレスを利用します。IP アドレスはそのままでは保存せず、日ごとに変わる値と組み合わせて変換したうえで記録し、数日以内に自動で削除します。'
    );
  });
});
