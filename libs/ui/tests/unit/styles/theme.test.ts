import theme from '../../../src/styles/theme';

describe('theme', () => {
  describe('palette', () => {
    /*
     * NOTE: MUI 内部の alpha() / decomposeColor() が CSS 変数を色として
     * 解釈できないため、palette には具体的な色値を与えている。
     * 値は tokens.css の light テーマと対応する Primitive を反映する。
     */
    it('primary が tokens の Primitive blue 系と一致すること', () => {
      expect(theme.palette.primary.main).toBe('#1565c0');
      expect(theme.palette.primary.light).toBe('#42a5f5');
      expect(theme.palette.primary.dark).toBe('#0d47a1');
      expect(theme.palette.primary.contrastText).toBe('#ffffff');
    });

    it('secondary / error / warning / info / success に意味的な色が与えられていること', () => {
      expect(theme.palette.secondary.main).toBe('#424242');
      expect(theme.palette.error.main).toBe('#d32f2f');
      expect(theme.palette.warning.main).toBe('#ed6c02');
      expect(theme.palette.info.main).toBe('#0288d1');
      expect(theme.palette.success.main).toBe('#2e7d32');
    });

    it('background / text / divider が定義されていること', () => {
      expect(theme.palette.background.default).toBe('#fafafa');
      expect(theme.palette.background.paper).toBe('#ffffff');
      expect(theme.palette.text.primary).toBe('rgba(0, 0, 0, 0.87)');
      expect(theme.palette.text.secondary).toBe('rgba(0, 0, 0, 0.6)');
      expect(theme.palette.text.disabled).toBe('rgba(0, 0, 0, 0.38)');
      expect(theme.palette.divider).toBe('#e0e0e0');
    });
  });

  describe('typography', () => {
    it('fontFamily が --font-family-sans を参照', () => {
      expect(theme.typography.fontFamily).toBe('var(--font-family-sans)');
    });

    it('button.textTransform が none に設定されていること', () => {
      expect(theme.typography.button?.textTransform).toBe('none');
    });
  });

  describe('breakpoints', () => {
    it('values が tokens の定義と一致すること', () => {
      expect(theme.breakpoints.values.xs).toBe(0);
      expect(theme.breakpoints.values.sm).toBe(600);
      expect(theme.breakpoints.values.md).toBe(900);
      expect(theme.breakpoints.values.lg).toBe(1200);
      expect(theme.breakpoints.values.xl).toBe(1536);
    });
  });

  describe('component overrides', () => {
    it('MuiButton の root に CSS 変数が反映されていること', () => {
      const buttonOverrides = theme.components?.MuiButton?.styleOverrides;
      expect(buttonOverrides).toBeDefined();
      const root = buttonOverrides?.root as { borderRadius?: string };
      expect(root?.borderRadius).toBe('var(--radius-md)');
    });

    it('MuiCard の root に CSS 変数が反映されていること', () => {
      const cardOverrides = theme.components?.MuiCard?.styleOverrides;
      expect(cardOverrides).toBeDefined();
      const root = cardOverrides?.root as {
        borderRadius?: string;
        boxShadow?: string;
      };
      expect(root?.borderRadius).toBe('var(--radius-lg)');
      expect(root?.boxShadow).toBe('var(--shadow-md)');
    });

    it('MuiTextField の defaultProps が outlined であること', () => {
      const textFieldDefaults = theme.components?.MuiTextField?.defaultProps;
      expect(textFieldDefaults?.variant).toBe('outlined');
    });
  });
});
