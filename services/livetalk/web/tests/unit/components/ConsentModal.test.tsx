import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConsentModal from '@/components/ConsentModal';
import type { ConsentNotice } from '@/lib/consent/notice';

function checkAll() {
  for (const checkbox of screen.getAllByRole('checkbox')) {
    fireEvent.click(checkbox);
  }
}

describe('ConsentModal', () => {
  it('3 つすべてにチェックすると「利用開始」が押せる', () => {
    render(<ConsentModal open={true} onConsented={jest.fn()} />);
    expect(screen.getByTestId('consent-submit')).toBeDisabled();

    checkAll();

    expect(screen.getByTestId('consent-submit')).toBeEnabled();
  });

  it('閉じてから開き直すと、チェックが外れた状態から始まる', () => {
    const { rerender } = render(<ConsentModal open={true} onConsented={jest.fn()} />);
    checkAll();
    expect(screen.getByTestId('consent-submit')).toBeEnabled();

    rerender(<ConsentModal open={false} onConsented={jest.fn()} />);
    rerender(<ConsentModal open={true} onConsented={jest.fn()} />);

    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).not.toBeChecked();
    }
    expect(screen.getByTestId('consent-submit')).toBeDisabled();
  });

  it('開いたままの再描画では、チェックを保つ', () => {
    const { rerender } = render(<ConsentModal open={true} onConsented={jest.fn()} />);
    checkAll();

    rerender(<ConsentModal open={true} onConsented={jest.fn()} />);

    expect(screen.getByTestId('consent-submit')).toBeEnabled();
  });
});

describe('ConsentModal 改定のお知らせ', () => {
  const bothRevised: ConsentNotice = {
    kind: 'revision',
    ageRequired: false,
    documents: [
      {
        key: 'terms',
        label: '利用規約',
        href: '/legal/terms',
        version: '1.1.0',
        effectiveDate: '2026年11月15日',
        summary: ['規約の要点A'],
      },
      {
        key: 'privacy',
        label: 'プライバシーポリシー',
        href: '/legal/privacy',
        version: '1.1.0',
        effectiveDate: null,
        summary: [],
      },
    ],
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  it('初回は「リブトークへようこそ」と 3 つのチェックを出す', () => {
    render(<ConsentModal open={true} onConsented={jest.fn()} notice={{ kind: 'initial' }} />);
    expect(screen.getByTestId('consent-title')).toHaveTextContent('リブトークへようこそ');
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByTestId('consent-submit')).toHaveTextContent('利用開始');
  });

  it('両方の文書が変わったときは、タイトル・施行日・要点・全文へのリンクを出し、年齢は求めない', () => {
    render(<ConsentModal open={true} onConsented={jest.fn()} notice={bothRevised} />);

    expect(screen.getByTestId('consent-title')).toHaveTextContent(
      '利用規約・プライバシーポリシーを改定しました'
    );
    expect(screen.getByTestId('consent-revision')).toHaveTextContent(
      '利用規約（バージョン 1.1.0・2026年11月15日施行）'
    );
    expect(screen.getByText('規約の要点A')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '利用規約の全文を読む' })).toHaveAttribute(
      'href',
      '/legal/terms'
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.queryByTestId('age-checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/医療・心理カウンセリング/)).not.toBeInTheDocument();
    expect(screen.getByTestId('consent-submit')).toHaveTextContent('同意して続ける');
  });

  it('改定の同意では ageVerified を送らない', async () => {
    const onConsented = jest.fn();
    render(<ConsentModal open={true} onConsented={onConsented} notice={bothRevised} />);
    checkAll();
    fireEvent.click(screen.getByTestId('consent-submit'));

    await waitFor(() => expect(onConsented).toHaveBeenCalled());
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toEqual({ termsAgreed: true, privacyAgreed: true });
  });

  it('片方の文書だけ変わったときは、その文書のタイトルとチェックだけを出す', () => {
    const onlyTerms: ConsentNotice = { ...bothRevised, documents: [bothRevised.documents[0]] };
    render(<ConsentModal open={true} onConsented={jest.fn()} notice={onlyTerms} />);

    expect(screen.getByTestId('consent-title')).toHaveTextContent('利用規約を改定しました');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByLabelText(/利用規約（バージョン 1\.1\.0）に同意する/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/プライバシーポリシー.*に同意する/)).not.toBeInTheDocument();
  });

  it('年齢の記録が無い改定では年齢のチェックも求め、ageVerified を送る', async () => {
    const onConsented = jest.fn();
    render(
      <ConsentModal
        open={true}
        onConsented={onConsented}
        notice={{ ...bothRevised, ageRequired: true }}
      />
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    checkAll();
    fireEvent.click(screen.getByTestId('consent-submit'));

    await waitFor(() => expect(onConsented).toHaveBeenCalled());
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.ageVerified).toBe(true);
  });

  it('送信に失敗したらエラーを出す', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    render(<ConsentModal open={true} onConsented={jest.fn()} notice={bothRevised} />);
    checkAll();
    fireEvent.click(screen.getByTestId('consent-submit'));

    expect(await screen.findByTestId('consent-error')).toBeInTheDocument();
  });
});
