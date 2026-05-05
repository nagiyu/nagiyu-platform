import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import Button from '../../../../src/components/Button/Button';

describe('Button', () => {
  describe('rendering', () => {
    it('children を表示する', () => {
      render(<Button>保存</Button>);
      expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    });

    it('既定で type="button" が付与される（form 内での誤送信防止）', () => {
      render(<Button>保存</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });

    it('明示された type を尊重する', () => {
      render(<Button type="submit">送信</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
    });

    it('className を受け付け、内部クラスとマージされる', () => {
      render(<Button className="custom-class">x</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('custom-class');
      expect(btn.className).toContain('button');
    });

    it('variant / color / size の組み合わせをクラスに反映する', () => {
      render(
        <Button variant="outline" color="danger" size="lg">
          x
        </Button>,
      );
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('variant-outline');
      expect(btn.className).toContain('color-danger');
      expect(btn.className).toContain('size-lg');
    });

    it('既定値（solid / primary / md）が適用される', () => {
      render(<Button>x</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('variant-solid');
      expect(btn.className).toContain('color-primary');
      expect(btn.className).toContain('size-md');
    });
  });

  describe('events', () => {
    it('onClick が発火する', async () => {
      const onClick = jest.fn();
      const user = userEvent.setup();
      render(<Button onClick={onClick}>x</Button>);
      await user.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('disabled の時は onClick が発火しない', async () => {
      const onClick = jest.fn();
      const user = userEvent.setup();
      render(
        <Button onClick={onClick} disabled>
          x
        </Button>,
      );
      await user.click(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('loading の時は onClick が発火しない', async () => {
      const onClick = jest.fn();
      const user = userEvent.setup();
      render(
        <Button onClick={onClick} loading>
          x
        </Button>,
      );
      await user.click(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('loading', () => {
    it('スピナーを表示し、aria-busy を true にする', () => {
      render(<Button loading>送信中</Button>);
      const btn = screen.getByRole('button');
      expect(btn).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
    });

    it('loading 時は disabled 属性も付与される', () => {
      render(<Button loading>x</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('loading でない時はスピナーを表示しない', () => {
      render(<Button>x</Button>);
      expect(screen.queryByTestId('button-spinner')).not.toBeInTheDocument();
    });
  });

  describe('asChild', () => {
    it('子要素のタグをそのまま使い、props をマージする', () => {
      render(
        <Button asChild color="primary" variant="solid">
          <a href="/dashboard">go</a>
        </Button>,
      );
      const link = screen.getByRole('link', { name: 'go' });
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '/dashboard');
      expect(link.className).toContain('button');
      expect(link.className).toContain('color-primary');
    });

    it('asChild + disabled では aria-disabled を付与し、disabled 属性は付けない', () => {
      render(
        <Button asChild disabled>
          <a href="/x">go</a>
        </Button>,
      );
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('aria-disabled', 'true');
      expect(link).not.toHaveAttribute('disabled');
    });

    it('asChild + loading では aria-busy を付与する', () => {
      render(
        <Button asChild loading>
          <a href="/x">go</a>
        </Button>,
      );
      expect(screen.getByRole('link')).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('ref', () => {
    it('forwardRef で button 要素にアクセスできる', () => {
      const ref = React.createRef<HTMLButtonElement>();
      render(<Button ref={ref}>x</Button>);
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });

  describe('accessibility', () => {
    it('既定状態で a11y 違反がない', async () => {
      const { container } = render(<Button>保存</Button>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('全 variant / color / size の組み合わせで a11y 違反がない', async () => {
      const variants = ['solid', 'outline', 'ghost'] as const;
      const colors = [
        'primary',
        'secondary',
        'danger',
        'success',
        'warning',
        'neutral',
      ] as const;
      const sizes = ['sm', 'md', 'lg'] as const;

      const { container } = render(
        <div>
          {variants.flatMap((variant) =>
            colors.flatMap((color) =>
              sizes.map((size) => (
                <Button key={`${variant}-${color}-${size}`} variant={variant} color={color} size={size}>
                  {variant}-{color}-{size}
                </Button>
              )),
            ),
          )}
        </div>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('loading 状態でも a11y 違反がない', async () => {
      const { container } = render(<Button loading>送信中</Button>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('disabled 状態でも a11y 違反がない', async () => {
      const { container } = render(<Button disabled>無効</Button>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
