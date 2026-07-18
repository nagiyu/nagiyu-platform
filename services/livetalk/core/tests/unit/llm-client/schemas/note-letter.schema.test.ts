import { NoteLetterSchema } from '../../../../src/llm-client/schemas/note-letter.schema.js';

describe('NoteLetterSchema', () => {
  const validPayload = {
    skip: false,
    usedSelfHook: true,
    headline: '手紙の文面',
  };

  it('全フィールドが揃っていれば受理する', () => {
    const result = NoteLetterSchema.safeParse(validPayload);
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
