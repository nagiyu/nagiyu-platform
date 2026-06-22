import {
  ERROR_MESSAGES,
  CONTACT_FORM_URL,
  GITHUB_ISSUES_URL,
  CONTACT_USE_CASES,
  CONTACT_NOTES,
} from '@/lib/contact';

describe('contact', () => {
  describe('ERROR_MESSAGES', () => {
    it('エラーメッセージ定数が定義されている', () => {
      expect(ERROR_MESSAGES.CONTACT_DATA_NOT_FOUND).toBe(
        'お問い合わせページのデータが見つかりません'
      );
    });
  });

  describe('CONTACT_FORM_URL', () => {
    it('Google フォームの URL が定義されている', () => {
      expect(CONTACT_FORM_URL).toBe('https://forms.gle/oxzHNFBWBpFGNaKm7');
    });

    it('Google フォームの URL が https:// で始まる', () => {
      expect(CONTACT_FORM_URL.startsWith('https://')).toBe(true);
    });

    it('Google フォームの URL が forms.gle ドメインを含む', () => {
      expect(CONTACT_FORM_URL).toContain('forms.gle');
    });
  });

  describe('GITHUB_ISSUES_URL', () => {
    it('GitHub Issues の URL が定義されている', () => {
      expect(GITHUB_ISSUES_URL).toBe('https://github.com/nagiyu/nagiyu-platform/issues');
    });

    it('GitHub Issues の URL が https:// で始まる', () => {
      expect(GITHUB_ISSUES_URL.startsWith('https://')).toBe(true);
    });

    it('GitHub Issues の URL が github.com を含む', () => {
      expect(GITHUB_ISSUES_URL).toContain('github.com');
    });
  });

  describe('CONTACT_USE_CASES', () => {
    it('用途一覧が空でない', () => {
      expect(CONTACT_USE_CASES.length).toBeGreaterThan(0);
    });

    it('各用途に title と description が含まれる', () => {
      CONTACT_USE_CASES.forEach((useCase) => {
        expect(typeof useCase.title).toBe('string');
        expect(useCase.title.length).toBeGreaterThan(0);
        expect(typeof useCase.description).toBe('string');
        expect(useCase.description.length).toBeGreaterThan(0);
      });
    });

    it('先頭の用途が記事に関するものである（技術メディアとして記事フィードバックを主とする）', () => {
      expect(CONTACT_USE_CASES[0].title).toContain('記事');
    });

    it('不具合報告に関する用途が含まれる', () => {
      const hasBugReport = CONTACT_USE_CASES.some((u) => u.title.includes('不具合'));
      expect(hasBugReport).toBe(true);
    });

    it('記事の誤り指摘に関する用途が含まれる', () => {
      const hasArticleCorrection = CONTACT_USE_CASES.some((u) => u.title.includes('記事'));
      expect(hasArticleCorrection).toBe(true);
    });

    it('その他のお問い合わせが含まれる', () => {
      const hasOther = CONTACT_USE_CASES.some((u) => u.title.includes('その他'));
      expect(hasOther).toBe(true);
    });
  });

  describe('CONTACT_NOTES', () => {
    it('注意事項リストが空でない', () => {
      expect(CONTACT_NOTES.length).toBeGreaterThan(0);
    });

    it('各注意事項が文字列である', () => {
      CONTACT_NOTES.forEach((note) => {
        expect(typeof note).toBe('string');
        expect(note.length).toBeGreaterThan(0);
      });
    });

    it('個人運営に関する注意事項が含まれる', () => {
      const hasPersonal = CONTACT_NOTES.some((n) => n.includes('個人'));
      expect(hasPersonal).toBe(true);
    });

    it('返信に関する注意事項が含まれる', () => {
      const hasReply = CONTACT_NOTES.some((n) => n.includes('返信'));
      expect(hasReply).toBe(true);
    });
  });
});
