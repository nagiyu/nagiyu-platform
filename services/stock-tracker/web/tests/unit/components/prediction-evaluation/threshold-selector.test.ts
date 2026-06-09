/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ThresholdSelector, {
  THRESHOLD_PRESETS,
} from '../../../../components/prediction-evaluation/ThresholdSelector';

describe('ThresholdSelector', () => {
  it('ラベルを表示し現在の値を反映する', () => {
    render(React.createElement(ThresholdSelector, { value: 0.5, onChange: jest.fn() }));
    expect(screen.getByText('Hit 判定閾値')).toBeTruthy();
    const select = screen.getByLabelText('Hit 判定閾値') as HTMLSelectElement;
    expect(select.value).toBe('0.5');
  });

  it('値変更時に onChange が数値で呼ばれる', () => {
    const onChange = jest.fn();
    render(React.createElement(ThresholdSelector, { value: 0.5, onChange }));

    const select = screen.getByLabelText('Hit 判定閾値') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '1' } });

    expect(onChange).toHaveBeenCalledWith(1.0);
  });

  it('プリセット以外の値が来ても onChange を呼ばない', () => {
    const onChange = jest.fn();
    render(React.createElement(ThresholdSelector, { value: 0.5, onChange }));

    const select = screen.getByLabelText('Hit 判定閾値') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '99' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('すべてのプリセット値（0.25 / 0.5 / 0.75 / 1.0 / 1.5 / 2.0）がオプションとして存在する', () => {
    render(React.createElement(ThresholdSelector, { value: 0.5, onChange: jest.fn() }));
    const select = screen.getByLabelText('Hit 判定閾値') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => parseFloat(o.value));

    for (const preset of THRESHOLD_PRESETS) {
      expect(optionValues).toContain(preset);
    }
  });

  it('初期値として 0.25 を指定できる', () => {
    render(React.createElement(ThresholdSelector, { value: 0.25, onChange: jest.fn() }));
    const select = screen.getByLabelText('Hit 判定閾値') as HTMLSelectElement;
    expect(select.value).toBe('0.25');
  });

  it('初期値として 2.0 を指定できる', () => {
    render(React.createElement(ThresholdSelector, { value: 2.0, onChange: jest.fn() }));
    const select = screen.getByLabelText('Hit 判定閾値') as HTMLSelectElement;
    expect(select.value).toBe('2');
  });
});
