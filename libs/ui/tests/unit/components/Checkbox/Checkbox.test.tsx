import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import Checkbox from '../../../../src/components/Checkbox/Checkbox';

describe('Checkbox', () => {
  describe('rendering', () => {
    it('input[type=checkbox] を描画する', () => {
      render(<Checkbox aria-label="テスト" />);
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('label を渡すと <label> でラップされ、input と関連付けられる', () => {
      render(<Checkbox label="同意します" />);
      const checkbox = screen.getByLabelText('同意します');
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).toHaveAttribute('type', 'checkbox');
    });

    it('id を明示すれば尊重される', () => {
      render(<Checkbox id="my-cb" label="x" />);
      expect(screen.getByLabelText('x')).toHaveAttribute('id', 'my-cb');
    });

    it('label なしでも aria-label があれば指定できる', () => {
      render(<Checkbox aria-label="検索" />);
      expect(screen.getByRole('checkbox', { name: '検索' })).toBeInTheDocument();
    });

    it('既定値（md / unchecked）が適用される', () => {
      const { container } = render(<Checkbox label="x" />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('size-md');
      expect(screen.getByRole('checkbox')).not.toBeChecked();
    });
  });

  describe('events', () => {
    it('クリックで onChange が発火し、checked の値が伝わる', async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      render(<Checkbox label="x" onChange={onChange} />);
      await user.click(screen.getByLabelText('x'));
      expect(onChange).toHaveBeenCalledTimes(1);
      const event = onChange.mock.calls[0][0];
      expect(event.target.checked).toBe(true);
    });

    it('label テキストをクリックでも input にフォーカス・状態変化が起きる', async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      render(<Checkbox label="同意します" onChange={onChange} />);
      // label テキスト要素をクリック
      await user.click(screen.getByText('同意します'));
      expect(onChange).toHaveBeenCalled();
    });

    it('disabled の時は onChange が発火しない', async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      render(<Checkbox label="x" disabled onChange={onChange} />);
      await user.click(screen.getByLabelText('x'));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('Space キーでも onChange が発火する', async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      render(<Checkbox label="x" onChange={onChange} />);
      const checkbox = screen.getByLabelText('x');
      checkbox.focus();
      await user.keyboard(' ');
      expect(onChange).toHaveBeenCalled();
    });
  });

  describe('controlled', () => {
    it('checked を渡せば制御コンポーネントとして動作する', () => {
      const { rerender } = render(<Checkbox label="x" checked={false} onChange={() => {}} />);
      expect(screen.getByRole('checkbox')).not.toBeChecked();
      rerender(<Checkbox label="x" checked={true} onChange={() => {}} />);
      expect(screen.getByRole('checkbox')).toBeChecked();
    });

    it('defaultChecked で初期値を設定できる', () => {
      render(<Checkbox label="x" defaultChecked />);
      expect(screen.getByRole('checkbox')).toBeChecked();
    });
  });

  describe('states', () => {
    it('disabled=true で input に disabled 属性、wrapper に disabled クラス', () => {
      const { container } = render(<Checkbox label="x" disabled />);
      expect(screen.getByRole('checkbox')).toBeDisabled();
      expect((container.firstChild as HTMLElement).className).toContain('disabled');
    });

    it('required=true で input に required 属性、ラベルにアスタリスク', () => {
      const { container } = render(<Checkbox label="同意" required />);
      expect(screen.getByRole('checkbox')).toBeRequired();
      expect(container.textContent).toContain('*');
    });

    it('indeterminate=true で DOM プロパティが設定される', () => {
      render(<Checkbox label="x" indeterminate />);
      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.indeterminate).toBe(true);
    });

    it('indeterminate=false に切り替えると DOM プロパティも解除される', () => {
      const { rerender } = render(<Checkbox label="x" indeterminate />);
      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.indeterminate).toBe(true);
      rerender(<Checkbox label="x" indeterminate={false} />);
      expect(checkbox.indeterminate).toBe(false);
    });
  });

  describe('size', () => {
    it.each(['sm', 'md', 'lg'] as const)('size=%s で対応するクラスが付与される', (size) => {
      const { container } = render(<Checkbox label="x" size={size} />);
      expect((container.firstChild as HTMLElement).className).toContain(`size-${size}`);
    });
  });

  describe('refs', () => {
    it('forwardRef で input 要素にアクセスできる', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Checkbox label="x" ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
      expect(ref.current?.type).toBe('checkbox');
    });

    it('inputRef でも input 要素にアクセスできる', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Checkbox label="x" inputRef={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });

    it('ref と inputRef を同時に渡しても両方に値がセットされる', () => {
      const ref1 = React.createRef<HTMLInputElement>();
      const ref2 = React.createRef<HTMLInputElement>();
      render(<Checkbox label="x" ref={ref1} inputRef={ref2} />);
      expect(ref1.current).toBeInstanceOf(HTMLInputElement);
      expect(ref2.current).toBeInstanceOf(HTMLInputElement);
      expect(ref1.current).toBe(ref2.current);
    });

    it('ref コールバック関数も呼ばれる', () => {
      const refFn = jest.fn();
      render(<Checkbox label="x" ref={refFn} />);
      expect(refFn).toHaveBeenCalled();
      expect(refFn.mock.calls[0][0]).toBeInstanceOf(HTMLInputElement);
    });

    it('inputRef コールバック関数も呼ばれる', () => {
      const refFn = jest.fn();
      render(<Checkbox label="x" inputRef={refFn} />);
      expect(refFn).toHaveBeenCalled();
      expect(refFn.mock.calls[0][0]).toBeInstanceOf(HTMLInputElement);
    });
  });

  describe('html attributes', () => {
    it('name / value が input に反映される', () => {
      render(<Checkbox label="x" name="agree" value="yes" />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('name', 'agree');
      expect(checkbox).toHaveAttribute('value', 'yes');
    });
  });

  describe('accessibility', () => {
    it('label を持つ既定状態で a11y 違反がない', async () => {
      const { container } = render(<Checkbox label="同意します" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('checked 状態で a11y 違反がない', async () => {
      const { container } = render(<Checkbox label="x" defaultChecked />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('disabled 状態で a11y 違反がない', async () => {
      const { container } = render(<Checkbox label="x" disabled />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('indeterminate 状態で a11y 違反がない', async () => {
      const { container } = render(<Checkbox label="x" indeterminate />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('label なし aria-label のみでも a11y 違反がない', async () => {
      const { container } = render(<Checkbox aria-label="検索" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
