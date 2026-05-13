/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PeriodSelector from '../../../../components/prediction-evaluation/PeriodSelector';

describe('PeriodSelector', () => {
  it('ラベルを表示し現在の値を反映する', () => {
    render(React.createElement(PeriodSelector, { value: '30d', onChange: jest.fn() }));
    expect(screen.getByText('集計期間')).toBeTruthy();
    const select = screen.getByLabelText('集計期間') as HTMLSelectElement;
    expect(select.value).toBe('30d');
  });

  it('値変更時に onChange が呼ばれる', () => {
    const onChange = jest.fn();
    render(React.createElement(PeriodSelector, { value: '7d', onChange }));

    const select = screen.getByLabelText('集計期間') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '30d' } });

    expect(onChange).toHaveBeenCalledWith('30d');
  });

  it('未定義の値（不正な期間）が来ても onChange を呼ばない', () => {
    const onChange = jest.fn();
    render(React.createElement(PeriodSelector, { value: '7d', onChange }));

    const select = screen.getByLabelText('集計期間') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'invalid' } });

    expect(onChange).not.toHaveBeenCalled();
  });
});
