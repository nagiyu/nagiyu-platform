import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColumnVisibilityButton } from '@/components/highlights/ColumnVisibilityButton';
import type { ColumnDefinition } from '@/constants/highlightTableColumns';
import type { ColumnVisibilityMap } from '@/hooks/useColumnVisibility';

const OPTIONAL_COLUMNS: ColumnDefinition[] = [
  { id: 'source', label: '抽出根拠', fixed: false, defaultVisible: false },
];

describe('ColumnVisibilityButton', () => {
  it('アイコンボタンが表示される', () => {
    render(
      <ColumnVisibilityButton
        columns={OPTIONAL_COLUMNS}
        visibilityMap={{ source: false }}
        onToggle={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '列設定' })).toBeInTheDocument();
  });

  it('初期状態ではポップオーバーが閉じている', () => {
    render(
      <ColumnVisibilityButton
        columns={OPTIONAL_COLUMNS}
        visibilityMap={{ source: false }}
        onToggle={jest.fn()}
      />
    );

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('ボタンクリックでポップオーバーが開く', () => {
    render(
      <ColumnVisibilityButton
        columns={OPTIONAL_COLUMNS}
        visibilityMap={{ source: false }}
        onToggle={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '列設定' }));

    expect(screen.getByRole('checkbox', { name: '抽出根拠' })).toBeInTheDocument();
  });

  it('visibilityMap が false の列のチェックボックスはオフ状態で表示される', () => {
    render(
      <ColumnVisibilityButton
        columns={OPTIONAL_COLUMNS}
        visibilityMap={{ source: false }}
        onToggle={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '列設定' }));

    expect(screen.getByRole('checkbox', { name: '抽出根拠' })).not.toBeChecked();
  });

  it('visibilityMap が true の列のチェックボックスはオン状態で表示される', () => {
    render(
      <ColumnVisibilityButton
        columns={OPTIONAL_COLUMNS}
        visibilityMap={{ source: true }}
        onToggle={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '列設定' }));

    expect(screen.getByRole('checkbox', { name: '抽出根拠' })).toBeChecked();
  });

  it('チェックボックスのクリックで onToggle が呼ばれる', () => {
    const onToggle = jest.fn();
    render(
      <ColumnVisibilityButton
        columns={OPTIONAL_COLUMNS}
        visibilityMap={{ source: false }}
        onToggle={onToggle}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '列設定' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '抽出根拠' }));

    expect(onToggle).toHaveBeenCalledWith('source');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('複数のオプション列がある場合にすべてのチェックボックスが表示される', () => {
    const multipleColumns: ColumnDefinition[] = [
      { id: 'source', label: '抽出根拠', fixed: false, defaultVisible: false },
      { id: 'score', label: 'スコア', fixed: false, defaultVisible: true },
    ];
    const visibilityMap: ColumnVisibilityMap = { source: false, score: true };

    render(
      <ColumnVisibilityButton
        columns={multipleColumns}
        visibilityMap={visibilityMap}
        onToggle={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '列設定' }));

    expect(screen.getByRole('checkbox', { name: '抽出根拠' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'スコア' })).toBeInTheDocument();
  });

  it('列が空の場合でもボタンが表示されポップオーバーが開く', () => {
    render(<ColumnVisibilityButton columns={[]} visibilityMap={{}} onToggle={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '列設定' }));

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
