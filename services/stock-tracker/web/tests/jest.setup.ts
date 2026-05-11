// react-markdown / remark-gfm は ESM 専用パッケージで、ts-jest の CJS トランスパイル下では
// そのまま import できない。テスト側ではレンダリング結果を直接検証しないため、
// グローバルに最小限のモックを差し込む。MARKDOWN_COMPONENTS マップ自体の動作検証は
// tests/unit/components/ai-analysis-markdown.test.ts で個別に行う。
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => undefined,
}));
