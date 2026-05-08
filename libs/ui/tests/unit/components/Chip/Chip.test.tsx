import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import Chip from '../../../../src/components/Chip/Chip';

describe('Chip', () => {
  describe('rendering', () => {
    it('children を表示する', () => {
      render(<Chip>タグ</Chip>);
      expect(screen.getByText('タグ')).toBeInTheDocument();
    });

    it('既定では <span> として描画される（onClick 無し / asChild 無し）', () => {
      const { container } = render(<Chip>x</Chip>);
      expect((container.firstChild as HTMLElement).tagName).toBe('SPAN');
    });

    it('既定値（solid / neutral / md）が適用される', () => {
      const { container } = render(<Chip>x</Chip>);
      const node = container.firstChild as HTMLElement;
      expect(node.className).toContain('variant-solid');
      expect(node.className).toContain('color-neutral');
      expect(node.className).toContain('size-md');
    });

    it('variant / color / size の組み合わせをクラスに反映する', () => {
      const { container } = render(
        <Chip variant="outline" color="success" size="sm">
          x
        </Chip>
      );
      const node = container.firstChild as HTMLElement;
      expect(node.className).toContain('variant-outline');
      expect(node.className).toContain('color-success');
      expect(node.className).toContain('size-sm');
    });

    it('className を受け付け、内部クラスとマージされる', () => {
      const { container } = render(<Chip className="custom">x</Chip>);
      const node = container.firstChild as HTMLElement;
      expect(node.className).toContain('custom');
      expect(node.className).toContain('chip');
    });
  });

  describe('clickable (button mode)', () => {
    it('onClick を渡すと <button type="button"> として描画される', () => {
      render(<Chip onClick={() => {}}>x</Chip>);
      const btn = screen.getByRole('button');
      expect(btn.tagName).toBe('BUTTON');
      expect(btn).toHaveAttribute('type', 'button');
    });

    it('クリックで onClick が発火する', async () => {
      const onClick = jest.fn();
      const user = userEvent.setup();
      render(<Chip onClick={onClick}>x</Chip>);
      await user.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('Space / Enter キーでも onClick が発火する', async () => {
      const onClick = jest.fn();
      const user = userEvent.setup();
      render(<Chip onClick={onClick}>x</Chip>);
      const btn = screen.getByRole('button');
      btn.focus();
      await user.keyboard(' ');
      await user.keyboard('{Enter}');
      expect(onClick).toHaveBeenCalledTimes(2);
    });

    it('clickable な場合は interactive クラスが付与される', () => {
      const { container } = render(<Chip onClick={() => {}}>x</Chip>);
      expect((container.firstChild as HTMLElement).className).toContain('interactive');
    });
  });

  describe('asChild', () => {
    it('asChild=true で子要素のタグをそのまま使い、props をマージする', () => {
      render(
        <Chip asChild color="primary" variant="outline">
          <a href="/tags/foo">タグ foo</a>
        </Chip>
      );
      const link = screen.getByRole('link', { name: 'タグ foo' });
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '/tags/foo');
      expect(link.className).toContain('chip');
      expect(link.className).toContain('color-primary');
      expect(link.className).toContain('variant-outline');
    });

    it('asChild の場合は interactive クラスが付与される', () => {
      const { container } = render(
        <Chip asChild>
          <a href="/x">x</a>
        </Chip>
      );
      expect((container.firstChild as HTMLElement).className).toContain('interactive');
    });

    it('asChild + button: 子の <button> 要素にスタイルを適用できる', () => {
      const onClick = jest.fn();
      render(
        <Chip asChild>
          <button onClick={onClick}>クリックタグ</button>
        </Chip>
      );
      const btn = screen.getByRole('button', { name: 'クリックタグ' });
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.className).toContain('chip');
    });
  });

  describe('html attributes', () => {
    it('aria-label などの追加属性が反映される', () => {
      render(<Chip aria-label="ステータス: 成功">成功</Chip>);
      expect(screen.getByLabelText('ステータス: 成功')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('既定状態で a11y 違反がない', async () => {
      const { container } = render(<Chip>タグ</Chip>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('全 variant / color / size の組み合わせで a11y 違反がない', async () => {
      const variants = ['solid', 'outline'] as const;
      const colors = ['primary', 'secondary', 'danger', 'success', 'warning', 'neutral'] as const;
      const sizes = ['sm', 'md', 'lg'] as const;

      const { container } = render(
        <div>
          {variants.flatMap((variant) =>
            colors.flatMap((color) =>
              sizes.map((size) => (
                <Chip
                  key={`${variant}-${color}-${size}`}
                  variant={variant}
                  color={color}
                  size={size}
                >
                  {variant}-{color}-{size}
                </Chip>
              ))
            )
          )}
        </div>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('clickable 状態で a11y 違反がない', async () => {
      const { container } = render(<Chip onClick={() => {}}>クリック</Chip>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('asChild + a タグで a11y 違反がない', async () => {
      const { container } = render(
        <Chip asChild>
          <a href="/x">リンク</a>
        </Chip>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
