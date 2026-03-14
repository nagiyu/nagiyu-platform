import { render, screen } from '@testing-library/react';
import ServiceLayout from '../../../../src/components/layout/ServiceLayout';

describe('ServiceLayout', () => {
  it('標準構成で Header・main・Footer を描画する', () => {
    const { container } = render(
      <ServiceLayout
        headerProps={{ title: 'Admin', ariaLabel: 'Admin ホームページに戻る' }}
        footerProps={{ version: '2.0.0' }}
      >
        <div>メインコンテンツ</div>
      </ServiceLayout>
    );

    expect(screen.getByLabelText('Admin ホームページに戻る')).toBeInTheDocument();
    expect(screen.getByText('メインコンテンツ')).toBeInTheDocument();
    expect(screen.getByText(/v2\.0\.0/)).toBeInTheDocument();
    expect(container.querySelector('main')).toBeInTheDocument();
  });

  it('headerSlot と footerSlot でサービス固有UIを差し込める', () => {
    render(
      <ServiceLayout
        headerSlot={<nav aria-label="カスタムヘッダー">Custom Header</nav>}
        footerSlot={<footer>Custom Footer</footer>}
      >
        <div>メインコンテンツ</div>
      </ServiceLayout>
    );

    expect(screen.getByLabelText('カスタムヘッダー')).toBeInTheDocument();
    expect(screen.getByText('Custom Footer')).toBeInTheDocument();
    expect(screen.queryByText('プライバシーポリシー')).not.toBeInTheDocument();
  });

  it('headerProps/footerProps 未指定でもデフォルト表示で描画できる', () => {
    render(
      <ServiceLayout>
        <div>メインコンテンツ</div>
      </ServiceLayout>
    );

    expect(screen.getByLabelText('Nagiyu Platform - Navigate to homepage')).toBeInTheDocument();
    expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument();
  });
});
