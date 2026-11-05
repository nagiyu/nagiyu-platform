import { render, screen } from '@testing-library/react';
import CommercialTransactionsTable from '../../../../src/components/legal/CommercialTransactionsTable';
import { commercialTransactionItems } from '../../../../src/data/commercialTransactionsData';

describe('CommercialTransactionsTable', () => {
  const plansHref = 'https://auth.example.com/plans';

  it('全項目の項目名を行見出し (th scope=row) として表示する', () => {
    render(<CommercialTransactionsTable plansHref={plansHref} />);

    expect(commercialTransactionItems).toHaveLength(15);
    for (const item of commercialTransactionItems) {
      const header = screen.getByRole('rowheader', { name: item.label });
      expect(header.tagName).toBe('TH');
      expect(header).toHaveAttribute('scope', 'row');
    }
  });

  it('請求で開示する項目の本文を表示する', () => {
    render(<CommercialTransactionsTable plansHref={plansHref} />);

    expect(screen.getAllByText('請求があれば遅滞なく開示いたします。')).toHaveLength(4);
    expect(screen.getByText('なぎゆー')).toBeInTheDocument();
  });

  it('販売価格の「プランのページ」を plansHref へのリンクにする', () => {
    render(<CommercialTransactionsTable plansHref={plansHref} />);

    const link = screen.getByRole('link', { name: 'プランのページ' });
    expect(link).toHaveAttribute('href', plansHref);
    const cell = link.closest('td');
    expect(cell?.textContent).toBe('各プランの価格 (税込) は、プランのページに表示しています。');
  });

  it('メールアドレスを mailto リンクにする', () => {
    render(<CommercialTransactionsTable plansHref={plansHref} />);

    const link = screen.getByRole('link', { name: 'otonagiyu@gmail.com' });
    expect(link).toHaveAttribute('href', 'mailto:otonagiyu@gmail.com');
  });
});
