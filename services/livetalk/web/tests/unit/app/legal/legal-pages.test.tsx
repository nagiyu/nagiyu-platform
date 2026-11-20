import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import TermsPage from '@/app/legal/terms/page';
import PrivacyPage from '@/app/legal/privacy/page';

// core の入口はサーバー専用の依存を読み込むため、版の定数だけを差し替える
jest.mock('@nagiyu/livetalk-core', () => ({
  LIVETALK_TERMS_VERSION: '1.1.0',
  LIVETALK_PRIVACY_VERSION: '1.1.0',
}));

describe('法務ページの改定履歴', () => {
  it('利用規約の末尾に、新しい版を上にした改定履歴を出す', () => {
    render(<TermsPage />);

    const history = screen.getByTestId('legal-revision-history');
    expect(history).toHaveTextContent('改定履歴');
    const headings = Array.from(history.querySelectorAll('h3')).map((h) => h.textContent);
    expect(headings).toEqual([
      'バージョン 1.1.0（2026年11月15日施行）',
      'バージョン 1.0.0（2026年5月26日施行）',
    ]);
    expect(history).toHaveTextContent('制定');
  });

  it('プライバシーポリシーの末尾に改定履歴を出す', () => {
    render(<PrivacyPage />);

    const history = screen.getByTestId('legal-revision-history');
    expect(history).toHaveTextContent('バージョン 1.1.0（2026年11月15日施行）');
    expect(history).toHaveTextContent('OpenAI');
  });
});
