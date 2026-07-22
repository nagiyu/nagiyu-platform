import { RegenerateSummarySchema } from '../../../../src/llm-client/schemas/regenerate-summary.schema.js';

describe('RegenerateSummarySchema', () => {
  it('canonicalSummary 文字列を受理する', () => {
    const result = RegenerateSummarySchema.safeParse({ canonicalSummary: '要約テキスト' });
    expect(result.success).toBe(true);
  });

  it('空文字も受理する（残 fact 0 件のケース）', () => {
    const result = RegenerateSummarySchema.safeParse({ canonicalSummary: '' });
    expect(result.success).toBe(true);
  });

  it('canonicalSummary が欠けていれば拒否する', () => {
    const result = RegenerateSummarySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('canonicalSummary が文字列以外なら拒否する', () => {
    const result = RegenerateSummarySchema.safeParse({ canonicalSummary: 123 });
    expect(result.success).toBe(false);
  });
});
