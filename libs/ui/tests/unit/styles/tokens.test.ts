import { breakpoints, tokens } from '../../../src/styles/tokens';

describe('tokens', () => {
  describe('color', () => {
    it('color.action.* が CSS 変数を参照する文字列であること', () => {
      expect(tokens.color.action.primary.default).toBe(
        'var(--color-action-primary)',
      );
      expect(tokens.color.action.danger.default).toBe(
        'var(--color-action-danger)',
      );
      expect(tokens.color.action.success.default).toBe(
        'var(--color-action-success)',
      );
    });

    it('color.action.{role} に default / hover / active / subtle / fg が揃っていること', () => {
      const roles = [
        'primary',
        'secondary',
        'danger',
        'warning',
        'success',
        'info',
      ] as const;
      const states = ['default', 'hover', 'active', 'subtle', 'fg'] as const;

      for (const role of roles) {
        for (const state of states) {
          expect(tokens.color.action[role][state]).toMatch(/^var\(--/);
        }
      }
    });

    it('color.bg / color.fg / color.border が CSS 変数を参照すること', () => {
      expect(tokens.color.bg.canvas).toBe('var(--color-bg-canvas)');
      expect(tokens.color.bg.surface).toBe('var(--color-bg-surface)');
      expect(tokens.color.fg.default).toBe('var(--color-fg-default)');
      expect(tokens.color.fg.muted).toBe('var(--color-fg-muted)');
      expect(tokens.color.border.default).toBe('var(--color-border-default)');
    });
  });

  describe('spacing', () => {
    it('xs / sm / md / lg / xl / 2xl が定義されていること', () => {
      expect(tokens.spacing.xs).toBe('var(--spacing-xs)');
      expect(tokens.spacing.sm).toBe('var(--spacing-sm)');
      expect(tokens.spacing.md).toBe('var(--spacing-md)');
      expect(tokens.spacing.lg).toBe('var(--spacing-lg)');
      expect(tokens.spacing.xl).toBe('var(--spacing-xl)');
      expect(tokens.spacing['2xl']).toBe('var(--spacing-2xl)');
    });
  });

  describe('typography', () => {
    it('fontFamily / fontSize / fontWeight / lineHeight が定義されていること', () => {
      expect(tokens.fontFamily.sans).toBe('var(--font-family-sans)');
      expect(tokens.fontSize.md).toBe('var(--font-size-md)');
      expect(tokens.fontWeight.medium).toBe('var(--font-weight-medium)');
      expect(tokens.lineHeight.normal).toBe('var(--line-height-normal)');
    });
  });

  describe('radius', () => {
    it('none / sm / md / lg / full が定義されていること', () => {
      expect(tokens.radius.none).toBe('var(--radius-none)');
      expect(tokens.radius.sm).toBe('var(--radius-sm)');
      expect(tokens.radius.md).toBe('var(--radius-md)');
      expect(tokens.radius.lg).toBe('var(--radius-lg)');
      expect(tokens.radius.full).toBe('var(--radius-full)');
    });
  });

  describe('shadow', () => {
    it('sm / md / lg / xl が定義されていること', () => {
      expect(tokens.shadow.sm).toBe('var(--shadow-sm)');
      expect(tokens.shadow.md).toBe('var(--shadow-md)');
      expect(tokens.shadow.lg).toBe('var(--shadow-lg)');
      expect(tokens.shadow.xl).toBe('var(--shadow-xl)');
    });
  });

  describe('zIndex', () => {
    it('dropdown / sticky / modal / toast / tooltip が定義されていること', () => {
      expect(tokens.zIndex.dropdown).toBe('var(--z-dropdown)');
      expect(tokens.zIndex.sticky).toBe('var(--z-sticky)');
      expect(tokens.zIndex.modal).toBe('var(--z-modal)');
      expect(tokens.zIndex.toast).toBe('var(--z-toast)');
      expect(tokens.zIndex.tooltip).toBe('var(--z-tooltip)');
    });
  });

  describe('duration / easing', () => {
    it('fast / normal / slow が定義されていること', () => {
      expect(tokens.duration.fast).toBe('var(--duration-fast)');
      expect(tokens.duration.normal).toBe('var(--duration-normal)');
      expect(tokens.duration.slow).toBe('var(--duration-slow)');
    });

    it('linear / in / out / inOut が定義されていること', () => {
      expect(tokens.easing.linear).toBe('var(--easing-linear)');
      expect(tokens.easing.in).toBe('var(--easing-in)');
      expect(tokens.easing.out).toBe('var(--easing-out)');
      expect(tokens.easing.inOut).toBe('var(--easing-in-out)');
    });
  });
});

describe('breakpoints', () => {
  it('xs から xl までが昇順の数値で定義されていること', () => {
    expect(breakpoints.xs).toBe(0);
    expect(breakpoints.sm).toBe(600);
    expect(breakpoints.md).toBe(900);
    expect(breakpoints.lg).toBe(1200);
    expect(breakpoints.xl).toBe(1536);
  });

  it('数値型として扱えること（メディアクエリ等での利用想定）', () => {
    const all = Object.values(breakpoints);
    for (const value of all) {
      expect(typeof value).toBe('number');
    }
  });
});
