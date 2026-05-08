import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import TextField from '../../../../src/components/TextField/TextField';

describe('TextField', () => {
  describe('rendering', () => {
    it('既定で input[type=text] を描画する', () => {
      render(<TextField label="名前" />);
      const input = screen.getByLabelText('名前');
      expect(input.tagName).toBe('INPUT');
      expect(input).toHaveAttribute('type', 'text');
    });

    it('label を渡すと <label> が描画され、input と htmlFor で関連付けられる', () => {
      render(<TextField label="メールアドレス" />);
      const input = screen.getByLabelText('メールアドレス');
      expect(input).toBeInTheDocument();
    });

    it('id を明示すれば尊重される（label htmlFor も対応する）', () => {
      render(<TextField id="my-input" label="名前" />);
      const input = screen.getByLabelText('名前');
      expect(input).toHaveAttribute('id', 'my-input');
    });

    it('helperText を渡すと p 要素に描画され、aria-describedby で関連付けられる', () => {
      render(<TextField label="メール" helperText="example@example.com の形式" />);
      const input = screen.getByLabelText('メール');
      const helperId = input.getAttribute('aria-describedby');
      expect(helperId).toBeTruthy();
      const helper = document.getElementById(helperId!);
      expect(helper).toHaveTextContent('example@example.com の形式');
    });

    it('placeholder が反映される', () => {
      render(<TextField label="名前" placeholder="山田 太郎" />);
      expect(screen.getByPlaceholderText('山田 太郎')).toBeInTheDocument();
    });

    it('type を反映する', () => {
      render(<TextField label="数量" type="number" />);
      expect(screen.getByLabelText('数量')).toHaveAttribute('type', 'number');
    });

    it('既定値（md / no fullWidth）が適用される', () => {
      const { container } = render(<TextField label="x" />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('size-md');
      expect(wrapper.className).not.toContain('fullWidth');
    });
  });

  describe('events', () => {
    it('onChange が発火し、入力値が伝わる', async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      render(<TextField label="名前" onChange={onChange} />);
      const input = screen.getByLabelText('名前');
      await user.type(input, 'abc');
      expect(onChange).toHaveBeenCalled();
      expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('disabled の時は入力できない', async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      render(<TextField label="名前" disabled onChange={onChange} />);
      await user.type(screen.getByLabelText('名前'), 'x');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('readOnly の時は入力が反映されない', async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      render(<TextField label="名前" readOnly value="固定" onChange={onChange} />);
      await user.type(screen.getByLabelText('名前'), 'x');
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByLabelText('名前')).toHaveValue('固定');
    });
  });

  describe('states', () => {
    it('error=true で aria-invalid と error クラスが付与される', () => {
      const { container } = render(<TextField label="x" error helperText="ng" />);
      expect(screen.getByLabelText('x')).toHaveAttribute('aria-invalid', 'true');
      expect((container.firstChild as HTMLElement).className).toContain('error');
    });

    it('required=true でラベルにアスタリスクと required 属性が付く', () => {
      const { container } = render(<TextField label="名前" required />);
      expect(screen.getByLabelText(/名前/)).toBeRequired();
      expect(container.textContent).toContain('*');
    });

    it('disabled=true で input に disabled 属性、wrapper に disabled クラス', () => {
      const { container } = render(<TextField label="x" disabled />);
      expect(screen.getByLabelText('x')).toBeDisabled();
      expect((container.firstChild as HTMLElement).className).toContain('disabled');
    });

    it('readOnly=true で input に readonly 属性が付く', () => {
      render(<TextField label="x" readOnly value="ro" />);
      expect(screen.getByLabelText('x')).toHaveAttribute('readonly');
    });

    it('fullWidth=true で wrapper に fullWidth クラス', () => {
      const { container } = render(<TextField label="x" fullWidth />);
      expect((container.firstChild as HTMLElement).className).toContain('fullWidth');
    });
  });

  describe('multiline', () => {
    it('multiline=true で textarea に切り替わる', () => {
      render(<TextField label="本文" multiline />);
      const node = screen.getByLabelText('本文');
      expect(node.tagName).toBe('TEXTAREA');
    });

    it('rows を反映する', () => {
      render(<TextField label="x" multiline rows={5} />);
      expect(screen.getByLabelText('x')).toHaveAttribute('rows', '5');
    });

    it('rows 未指定で minRows のみ指定すると minRows が rows として反映される', () => {
      render(<TextField label="x" multiline minRows={3} />);
      expect(screen.getByLabelText('x')).toHaveAttribute('rows', '3');
    });
  });

  describe('constraints', () => {
    it('maxLength が input に反映される', () => {
      render(<TextField label="x" maxLength={5} />);
      expect(screen.getByLabelText('x')).toHaveAttribute('maxlength', '5');
    });
  });

  describe('size', () => {
    it.each(['sm', 'md', 'lg'] as const)('size=%s で対応するクラスが付与される', (size) => {
      const { container } = render(<TextField label="x" size={size} />);
      expect((container.firstChild as HTMLElement).className).toContain(`size-${size}`);
    });
  });

  describe('inputRef', () => {
    it('inputRef で input 要素にアクセスできる', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<TextField label="x" inputRef={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });

    it('multiline の inputRef は textarea を受け取る', () => {
      const ref = React.createRef<HTMLTextAreaElement>();
      render(<TextField label="x" multiline inputRef={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    });
  });

  describe('accessibility', () => {
    it('label がある既定状態で a11y 違反がない', async () => {
      const { container } = render(<TextField label="メールアドレス" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('error 状態で a11y 違反がない', async () => {
      const { container } = render(<TextField label="x" error helperText="ng" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('disabled 状態で a11y 違反がない', async () => {
      const { container } = render(<TextField label="x" disabled />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('multiline 状態で a11y 違反がない', async () => {
      const { container } = render(<TextField label="本文" multiline />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('label なしでも aria-label があれば a11y 違反がない', async () => {
      const { container } = render(<TextField aria-label="検索" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
