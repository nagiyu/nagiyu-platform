import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import Link from '../../../../src/components/Link/Link';

describe('Link', () => {
  describe('rendering', () => {
    it('children を表示する', () => {
      render(<Link href="/x">クリック</Link>);
      expect(screen.getByText('クリック')).toBeInTheDocument();
    });

    it('既定では <a> として描画される', () => {
      const { container } = render(<Link href="/x">x</Link>);
      expect((container.firstChild as HTMLElement).tagName).toBe('A');
    });

    it('href が反映される', () => {
      render(<Link href="/dashboard">x</Link>);
      expect(screen.getByRole('link')).toHaveAttribute('href', '/dashboard');
    });

    it('既定値（primary / hover）が適用される', () => {
      const { container } = render(<Link href="/x">x</Link>);
      const node = container.firstChild as HTMLElement;
      expect(node.className).toContain('color-primary');
      expect(node.className).toContain('underline-hover');
    });

    it('color / underline の組み合わせをクラスに反映する', () => {
      const { container } = render(
        <Link href="/x" color="danger" underline="always">
          x
        </Link>
      );
      const node = container.firstChild as HTMLElement;
      expect(node.className).toContain('color-danger');
      expect(node.className).toContain('underline-always');
    });

    it('className を受け付け、内部クラスとマージされる', () => {
      const { container } = render(
        <Link href="/x" className="custom">
          x
        </Link>
      );
      const node = container.firstChild as HTMLElement;
      expect(node.className).toContain('custom');
      expect(node.className).toContain('link');
    });
  });

  describe('html attributes', () => {
    it('target / rel が反映される', () => {
      render(
        <Link href="https://example.com" target="_blank" rel="noopener noreferrer">
          外部
        </Link>
      );
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('aria-label が反映される', () => {
      render(
        <Link href="/x" aria-label="ヘルプを開く">
          ?
        </Link>
      );
      expect(screen.getByLabelText('ヘルプを開く')).toBeInTheDocument();
    });
  });

  describe('asChild', () => {
    it('asChild=true で子要素のタグをそのまま使い、props をマージする', () => {
      render(
        <Link asChild color="success" underline="always">
          <a href="/foo">SPA リンク</a>
        </Link>
      );
      const link = screen.getByRole('link', { name: 'SPA リンク' });
      expect(link.tagName).toBe('A');
      expect(link).toHaveAttribute('href', '/foo');
      expect(link.className).toContain('link');
      expect(link.className).toContain('color-success');
      expect(link.className).toContain('underline-always');
    });
  });

  describe('color', () => {
    it.each([
      'primary',
      'secondary',
      'danger',
      'success',
      'warning',
      'neutral',
      'inherit',
    ] as const)('color=%s で対応するクラスが付与される', (color) => {
      const { container } = render(
        <Link href="/x" color={color}>
          x
        </Link>
      );
      expect((container.firstChild as HTMLElement).className).toContain(`color-${color}`);
    });
  });

  describe('underline', () => {
    it.each(['none', 'hover', 'always'] as const)(
      'underline=%s で対応するクラスが付与される',
      (underline) => {
        const { container } = render(
          <Link href="/x" underline={underline}>
            x
          </Link>
        );
        expect((container.firstChild as HTMLElement).className).toContain(`underline-${underline}`);
      }
    );
  });

  describe('refs', () => {
    it('forwardRef で a 要素にアクセスできる', () => {
      const ref = React.createRef<HTMLAnchorElement>();
      render(
        <Link href="/x" ref={ref}>
          x
        </Link>
      );
      expect(ref.current).toBeInstanceOf(HTMLAnchorElement);
    });
  });

  describe('accessibility', () => {
    it('既定状態で a11y 違反がない', async () => {
      const { container } = render(<Link href="/x">テスト</Link>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('全 color の組み合わせで a11y 違反がない', async () => {
      const colors = [
        'primary',
        'secondary',
        'danger',
        'success',
        'warning',
        'neutral',
        'inherit',
      ] as const;
      const { container } = render(
        <div>
          {colors.map((color) => (
            <Link key={color} href="/x" color={color}>
              {color}
            </Link>
          ))}
        </div>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('外部リンク（target=_blank + rel）でも a11y 違反がない', async () => {
      const { container } = render(
        <Link href="https://example.com" target="_blank" rel="noopener noreferrer">
          外部
        </Link>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
