import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ListWorkspace } from '@/components/ListWorkspace';

describe('ListWorkspace', () => {
  it('個人と共有を切り替え、共有ではグループ選択を表示する', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    render(<ListWorkspace initialListId="mock-default-list" />);

    expect(screen.getByRole('combobox', { name: '表示範囲' })).toHaveTextContent('個人');
    expect(screen.getByRole('heading', { name: '個人リスト' })).toBeInTheDocument();
    expect(screen.getByText('牛乳を買う')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByLabelText('表示範囲'));
    fireEvent.click(screen.getByRole('option', { name: '共有' }));

    expect(screen.getByRole('combobox', { name: '表示範囲' })).toHaveTextContent('共有');
    expect(screen.getByRole('combobox', { name: 'グループ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '共有リスト' })).toBeInTheDocument();
    expect(screen.getByText('会議用の議題を共有する')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByLabelText('グループ'));
    fireEvent.click(screen.getByRole('option', { name: 'プロジェクトA' }));
    expect(screen.getByText('プロジェクトAタスク')).toBeInTheDocument();
    consoleWarnSpy.mockRestore();
  });

  it('共有リストIDで開いた場合は共有スコープと対応グループを初期表示する', () => {
    render(<ListWorkspace initialListId="mock-list-3" />);

    expect(screen.getByRole('combobox', { name: '表示範囲' })).toHaveTextContent('共有');
    expect(screen.getByRole('combobox', { name: 'グループ' })).toHaveTextContent('ルームメイト');
    expect(screen.getByRole('heading', { name: '共有リスト' })).toBeInTheDocument();
    expect(screen.getByText('ルームメイト家事分担')).toBeInTheDocument();
    expect(screen.getByText('ゴミ出し当番を確認する')).toBeInTheDocument();
  });
});
