import { NoteLetterSchema } from '../../../../src/llm-client/schemas/note-letter.schema.js';

describe('NoteLetterSchema', () => {
  const validPayload = {
    skip: false,
    usedSelfHook: true,
    usedRequestHook: false,
    headline: '手紙の文面',
  };

  it('全フィールドが揃っていれば受理する', () => {
    const result = NoteLetterSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('usedRequestHook が欠けていれば拒否する（OpenAI Structured Outputs 制約で必須）', () => {
    const rest: Record<string, unknown> = { ...validPayload };
    delete rest.usedRequestHook;
    const result = NoteLetterSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('usedRequestHook が真偽値以外なら拒否する', () => {
    const result = NoteLetterSchema.safeParse({ ...validPayload, usedRequestHook: 'true' });
    expect(result.success).toBe(false);
  });

  it('usedRequestHook=true（依頼フック使用）を受理する', () => {
    const result = NoteLetterSchema.safeParse({
      ...validPayload,
      usedSelfHook: false,
      usedRequestHook: true,
    });
    expect(result.success).toBe(true);
  });

  it('usedSelfHook が欠けていれば拒否する', () => {
    const rest: Record<string, unknown> = { ...validPayload };
    delete rest.usedSelfHook;
    const result = NoteLetterSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('headline が文字列以外なら拒否する', () => {
    const result = NoteLetterSchema.safeParse({ ...validPayload, headline: 123 });
    expect(result.success).toBe(false);
  });
});
