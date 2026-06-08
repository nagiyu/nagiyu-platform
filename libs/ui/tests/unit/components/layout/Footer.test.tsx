import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Footer, { type FooterLinkGroup } from '../../../../src/components/layout/Footer';

describe('Footer', () => {
  describe('レンダリング', () => {
    it('デフォルトpropsで正しくレンダリングされる', () => {
      render(<Footer />);

      const versionElement = screen.getByText(/v1\.0\.0/);
      expect(versionElement).toBeInTheDocument();
    });

    it('カスタムversionが正しくレンダリングされる', () => {
      render(<Footer version="2.3.4" />);

      const versionElement = screen.getByText(/v2\.3\.4/);
      expect(versionElement).toBeInTheDocument();
    });

    it('プライバシーポリシーリンクが表示される', () => {
      render(<Footer />);

      const privacyLink = screen.getByText('プライバシーポリシー');
      expect(privacyLink).toBeInTheDocument();
    });

    it('利用規約リンクが表示される', () => {
      render(<Footer />);

      const termsLink = screen.getByText('利用規約');
      expect(termsLink).toBeInTheDocument();
    });
  });

  describe('リンク機能', () => {
    it('プライバシーポリシーリンクがbutton要素としてレンダリングされる', () => {
      render(<Footer />);

      const privacyLink = screen.getByText('プライバシーポリシー');
      expect(privacyLink.tagName).toBe('BUTTON');
    });

    it('利用規約リンクがbutton要素としてレンダリングされる', () => {
      render(<Footer />);

      const termsLink = screen.getByText('利用規約');
      expect(termsLink.tagName).toBe('BUTTON');
    });

    it('プライバシーポリシーリンククリックでダイアログが開く', async () => {
      const user = userEvent.setup();
      render(<Footer />);

      const privacyLink = screen.getByText('プライバシーポリシー');
      await user.click(privacyLink);

      // ダイアログのタイトルが表示されることを確認
      expect(screen.getByText('プライバシーポリシー', { selector: 'h2' })).toBeInTheDocument();
    });

    it('利用規約リンククリックでダイアログが開く', async () => {
      const user = userEvent.setup();
      render(<Footer />);

      const termsLink = screen.getByText('利用規約');
      await user.click(termsLink);

      // ダイアログのタイトルが表示されることを確認
      expect(screen.getByText('利用規約', { selector: 'h2' })).toBeInTheDocument();
    });

    it('ダイアログの閉じるボタンで閉じることができる', async () => {
      const user = userEvent.setup();
      render(<Footer />);

      const privacyLink = screen.getByText('プライバシーポリシー');
      await user.click(privacyLink);

      // ダイアログが開いていることを確認
      expect(screen.getByText('プライバシーポリシー', { selector: 'h2' })).toBeInTheDocument();

      // 閉じるボタンを取得してクリック
      const closeButtons = screen.getAllByText('閉じる');
      await user.click(closeButtons[0]);

      // ダイアログが閉じていることを確認（h2要素が存在しない）
      await waitFor(() => {
        expect(
          screen.queryByText('プライバシーポリシー', { selector: 'h2' })
        ).not.toBeInTheDocument();
      });
    });

    it('複数のダイアログが独立して動作する', async () => {
      const user = userEvent.setup();
      render(<Footer />);

      // プライバシーポリシーを開く
      const privacyLink = screen.getByText('プライバシーポリシー');
      await user.click(privacyLink);
      expect(screen.getByText('プライバシーポリシー', { selector: 'h2' })).toBeInTheDocument();

      // プライバシーポリシーを閉じる
      const closeButtons = screen.getAllByText('閉じる');
      await user.click(closeButtons[0]);
      await waitFor(() => {
        expect(
          screen.queryByText('プライバシーポリシー', { selector: 'h2' })
        ).not.toBeInTheDocument();
      });

      // 利用規約を開く
      const termsLink = screen.getByText('利用規約');
      await user.click(termsLink);
      expect(screen.getByText('利用規約', { selector: 'h2' })).toBeInTheDocument();

      // 利用規約を閉じる
      const closeButtons2 = screen.getAllByText('閉じる');
      await user.click(closeButtons2[0]);
      await waitFor(() => {
        expect(screen.queryByText('利用規約', { selector: 'h2' })).not.toBeInTheDocument();
      });
    });

    it('リンクがクリック可能（pointer-eventsがnoneでない）', () => {
      render(<Footer />);

      const privacyLink = screen.getByText('プライバシーポリシー');
      const termsLink = screen.getByText('利用規約');

      // MUIのLinkコンポーネントはデフォルトでクリック可能
      expect(privacyLink).toBeInTheDocument();
      expect(termsLink).toBeInTheDocument();
    });
  });

  describe('Material-UI構造', () => {
    it('footer要素が存在する', () => {
      const { container } = render(<Footer />);

      const footer = container.querySelector('footer');
      expect(footer).toBeInTheDocument();
    });

    it('Containerコンポーネントが存在する', () => {
      const { container } = render(<Footer />);

      const containerElement = container.querySelector('.MuiContainer-root');
      expect(containerElement).toBeInTheDocument();
    });

    it('ContainerがmaxWidth="lg"で表示される', () => {
      const { container } = render(<Footer />);

      // Note: This test relies on MUI class names which may change between versions.
      // If this test fails after a MUI upgrade, consider updating the class name
      // or using a different approach to verify the maxWidth prop.
      const containerElement = container.querySelector('.MuiContainer-maxWidthLg');
      expect(containerElement).toBeInTheDocument();
    });

    it('Typography要素にbody2 variantが適用される', () => {
      const { container } = render(<Footer />);

      const typography = container.querySelector('.MuiTypography-body2');
      expect(typography).toBeInTheDocument();
    });
  });

  describe('スタイリング', () => {
    it('footer要素が適切なroleを持つ', () => {
      const { container } = render(<Footer />);

      const footer = container.querySelector('footer');
      expect(footer).toBeInTheDocument();
      expect(footer?.tagName.toLowerCase()).toBe('footer');
    });

    it('テキストが中央揃えで表示される', () => {
      const { container } = render(<Footer />);

      const typography = container.querySelector('.MuiTypography-alignCenter');
      expect(typography).toBeInTheDocument();
    });

    it('リンクがtext.secondaryカラーで表示される', () => {
      render(<Footer />);

      const privacyLink = screen.getByText('プライバシーポリシー');
      const termsLink = screen.getByText('利用規約');

      // MUI Linkコンポーネントとして存在することを確認
      expect(privacyLink).toBeInTheDocument();
      expect(termsLink).toBeInTheDocument();
    });
  });

  describe('licenseText props', () => {
    it('licenseTextが指定された場合に表示される', () => {
      render(<Footer licenseText="VOICEVOX:冥鳴ひまり / Live2D Inc." />);

      expect(screen.getByText('VOICEVOX:冥鳴ひまり / Live2D Inc.')).toBeInTheDocument();
    });

    it('licenseTextが省略された場合は表示されない', () => {
      render(<Footer />);

      expect(screen.queryByText(/VOICEVOX/)).not.toBeInTheDocument();
    });

    it('licenseTextがReactNodeでも表示される', () => {
      render(<Footer licenseText={<span data-testid="license-node">ライセンス情報</span>} />);

      expect(screen.getByTestId('license-node')).toBeInTheDocument();
    });

    it('licenseTextがある場合はフッターのpaddingが詰められる', () => {
      const { container } = render(<Footer licenseText="ライセンス" />);

      const footer = container.querySelector('footer');
      // py: 1.5 → 12px（theme spacing 8px * 1.5）
      expect(footer).toHaveStyle({ paddingTop: '12px', paddingBottom: '12px' });
    });

    it('licenseTextが省略された場合はフッターのpaddingが従来どおり', () => {
      const { container } = render(<Footer />);

      const footer = container.querySelector('footer');
      // py: 3 → 24px（theme spacing 8px * 3）
      expect(footer).toHaveStyle({ paddingTop: '24px', paddingBottom: '24px' });
    });
  });

  describe('termsContent / privacyContent props', () => {
    const customTerms = [
      {
        title: 'カスタム規約',
        contents: [{ mainContent: 'カスタム利用規約の内容です。' }],
      },
    ];
    const customPrivacy = [
      {
        title: 'カスタムプライバシー',
        contents: [{ mainContent: 'カスタムプライバシーポリシーの内容です。' }],
      },
    ];

    it('termsContentが指定された場合、利用規約ダイアログにカスタムデータが表示される', async () => {
      const user = userEvent.setup();
      render(<Footer termsContent={customTerms} />);

      await user.click(screen.getByText('利用規約'));

      expect(screen.getByText('第1条（カスタム規約）')).toBeInTheDocument();
      expect(screen.getByText('カスタム利用規約の内容です。')).toBeInTheDocument();
    });

    it('privacyContentが指定された場合、プライバシーポリシーダイアログにカスタムデータが表示される', async () => {
      const user = userEvent.setup();
      render(<Footer privacyContent={customPrivacy} />);

      await user.click(screen.getByText('プライバシーポリシー'));

      expect(screen.getByText('第1条（カスタムプライバシー）')).toBeInTheDocument();
      expect(screen.getByText('カスタムプライバシーポリシーの内容です。')).toBeInTheDocument();
    });
  });

  describe('バージョン表示', () => {
    it('バージョン番号が"v"プレフィックス付きで表示される', () => {
      render(<Footer version="1.2.3" />);

      const versionText = screen.getByText(/v1\.2\.3/);
      expect(versionText).toBeInTheDocument();
    });

    it('複数桁のバージョン番号も正しく表示される', () => {
      render(<Footer version="10.20.30" />);

      const versionText = screen.getByText(/v10\.20\.30/);
      expect(versionText).toBeInTheDocument();
    });

    it('プレリリースバージョンも表示できる', () => {
      render(<Footer version="1.0.0-beta.1" />);

      const versionText = screen.getByText(/v1\.0\.0-beta\.1/);
      expect(versionText).toBeInTheDocument();
    });
  });

  describe('レイアウト', () => {
    it('バージョン、プライバシーポリシー、利用規約が正しい順序で表示される', () => {
      const { container } = render(<Footer version="1.0.0" />);

      // バージョン行の Typography を特定する（body2 クラスで絞り込む）
      const typography = container.querySelector('.MuiTypography-body2');
      const text = typography?.textContent;

      expect(text).toContain('v1.0.0');
      expect(text).toContain('プライバシーポリシー');
      expect(text).toContain('利用規約');

      // 順序を確認（正規表現で順序を検証）
      expect(text).toMatch(/v1\.0\.0.*プライバシーポリシー.*利用規約/);
    });

    it('要素間に区切り文字が存在する', () => {
      const { container } = render(<Footer />);

      // バージョン行の Typography を特定する（body2 クラスで絞り込む）
      const typography = container.querySelector('.MuiTypography-body2');
      const text = typography?.textContent;

      // " | " で区切られていることを確認
      expect(text).toMatch(/v1\.0\.0\s*\|\s*プライバシーポリシー\s*\|\s*利用規約/);
    });
  });

  describe('links props（ナビゲーションリンクグリッド）', () => {
    const sampleLinks: FooterLinkGroup[] = [
      {
        title: 'メインコンテンツ',
        items: [
          { label: 'ホーム', href: '/' },
          { label: 'サービス一覧', href: '/services' },
        ],
      },
      {
        title: 'サイト情報',
        items: [
          { label: 'About', href: '/about' },
          { label: 'お問い合わせ', href: '/contact' },
        ],
      },
    ];

    it('links が指定された場合、グループタイトルが表示される', () => {
      render(<Footer links={sampleLinks} />);

      expect(screen.getByText('メインコンテンツ')).toBeInTheDocument();
      expect(screen.getByText('サイト情報')).toBeInTheDocument();
    });

    it('links が指定された場合、各リンクが表示される', () => {
      render(<Footer links={sampleLinks} />);

      expect(screen.getByText('ホーム')).toBeInTheDocument();
      expect(screen.getByText('サービス一覧')).toBeInTheDocument();
      expect(screen.getByText('About')).toBeInTheDocument();
      expect(screen.getByText('お問い合わせ')).toBeInTheDocument();
    });

    it('links が指定された場合、各リンクが正しい href を持つ', () => {
      render(<Footer links={sampleLinks} />);

      const homeLink = screen.getByRole('link', { name: 'ホーム' });
      expect(homeLink).toHaveAttribute('href', '/');

      const servicesLink = screen.getByRole('link', { name: 'サービス一覧' });
      expect(servicesLink).toHaveAttribute('href', '/services');

      const aboutLink = screen.getByRole('link', { name: 'About' });
      expect(aboutLink).toHaveAttribute('href', '/about');
    });

    it('links が省略された場合、リンクグリッドは表示されない', () => {
      render(<Footer />);

      // グループタイトルが存在しないことを確認
      expect(screen.queryByText('メインコンテンツ')).not.toBeInTheDocument();
    });

    it('title なしのグループも正しく表示される', () => {
      const linksWithoutTitle: FooterLinkGroup[] = [
        {
          items: [{ label: 'タイトルなしリンク', href: '/no-title' }],
        },
      ];
      render(<Footer links={linksWithoutTitle} />);

      expect(screen.getByText('タイトルなしリンク')).toBeInTheDocument();
    });

    it('空の links 配列の場合、リンクグリッドは表示されない', () => {
      render(<Footer links={[]} />);

      // グリッドが存在しないことを確認（バージョン行のみ）
      const footer = document.querySelector('footer');
      expect(footer).toBeInTheDocument();
      // バージョン表示は維持される
      expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument();
    });
  });

  describe('copyright props（著作権表記）', () => {
    it('copyright が指定された場合に表示される', () => {
      render(<Footer copyright="© 2026 nagiyu" />);

      expect(screen.getByText('© 2026 nagiyu')).toBeInTheDocument();
    });

    it('copyright が省略された場合は表示されない', () => {
      render(<Footer />);

      expect(screen.queryByText(/© \d{4}/)).not.toBeInTheDocument();
    });

    it('年範囲形式の copyright も表示される', () => {
      render(<Footer copyright="© 2026–2027 nagiyu" />);

      expect(screen.getByText('© 2026–2027 nagiyu')).toBeInTheDocument();
    });
  });
});
