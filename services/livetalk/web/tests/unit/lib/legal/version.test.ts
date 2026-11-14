/**
 * @jest-environment node
 */
import { LIVETALK_PRIVACY_VERSION, LIVETALK_TERMS_VERSION } from '@nagiyu/livetalk-core';
import type { LegalSection } from '@nagiyu/ui';
import { liveTalkPrivacySections } from '@/lib/legal/privacy-data';
import { liveTalkTermsSections } from '@/lib/legal/terms-data';

// 条文はクライアントからも読まれ core の定数を参照できないため、末尾の版の記載を判定に使う版と突き合わせる
function lastContent(sections: LegalSection[]): string {
  const contents = sections[sections.length - 1].contents;
  return contents[contents.length - 1].mainContent;
}

describe('条文の末尾の版と同意の判定に使う版', () => {
  it('プライバシーポリシーの版が一致する', () => {
    expect(lastContent(liveTalkPrivacySections)).toContain(
      `バージョン: ${LIVETALK_PRIVACY_VERSION}`
    );
  });

  it('利用規約の版が一致する', () => {
    expect(lastContent(liveTalkTermsSections)).toContain(`バージョン: ${LIVETALK_TERMS_VERSION}`);
  });
});
