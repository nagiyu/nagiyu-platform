import { render, screen } from '@testing-library/react';
import LegalSections from '../../../../src/components/legal/LegalSections';
import type { LegalSection } from '../../../../src/types/legal';

describe('LegalSections', () => {
  const sections: LegalSection[] = [
    {
      title: '最初の条',
      contents: [
        { mainContent: '1行目\n2行目' },
        {
          mainContent: 'リスト付き本文',
          subContents: [
            { subContent: '項目A' },
            { subContent: '項目B', subItems: ['細目B-1', '細目B-2'] },
          ],
        },
        { mainContent: 'リンク付き本文', link: 'https://example.com/policy' },
      ],
    },
    { title: '次の条', contents: [{ mainContent: '次の本文' }] },
  ];

  it('条番号を並び順から採番して見出しを表示する', () => {
    render(<LegalSections sections={sections} />);

    const first = screen.getByText('第1条（最初の条）');
    expect(first.tagName).toBe('H2');
    expect(screen.getByText('第2条（次の条）')).toBeInTheDocument();
  });

  it('本文を pre-wrap で表示し、改行を保持する', () => {
    render(<LegalSections sections={sections} />);

    const main = screen.getByText(/1行目/);
    expect(main.textContent).toBe('1行目\n2行目');
    expect(main).toHaveStyle({ whiteSpace: 'pre-wrap' });
  });

  it('subContents を番号付きリストで表示する', () => {
    render(<LegalSections sections={sections} />);

    const lists = screen.getAllByRole('list');
    expect(lists[0].tagName).toBe('OL');
    expect(screen.getByText('項目A')).toBeInTheDocument();
    expect(screen.getByText('項目B')).toBeInTheDocument();
  });

  it('subItems を入れ子の番号付きリストで表示する', () => {
    render(<LegalSections sections={sections} />);

    const nested = screen.getByText('細目B-1').closest('ol');
    expect(nested).not.toBeNull();
    expect(nested?.closest('li')).toHaveTextContent('項目B');
    expect(screen.getByText('細目B-2')).toBeInTheDocument();
  });

  it('subContents が無い本文にはリストを表示しない', () => {
    render(
      <LegalSections sections={[{ title: '単独', contents: [{ mainContent: '本文のみ' }] }]} />
    );

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('link を別タブで開く既定色のリンクとして表示する', () => {
    render(<LegalSections sections={sections} />);

    const link = screen.getByRole('link', { name: 'https://example.com/policy' });
    expect(link).toHaveAttribute('href', 'https://example.com/policy');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveClass('color-primary');
  });

  it('link が無い本文にはリンクを表示しない', () => {
    render(
      <LegalSections sections={[{ title: '単独', contents: [{ mainContent: '本文のみ' }] }]} />
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('sections が空の場合は何も表示しない', () => {
    const { container } = render(<LegalSections sections={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
