import { isClipEditLocked } from '@/lib/highlight-edit-lock';

describe('isClipEditLocked', () => {
  it.each([
    ['PENDING', false, false],
    ['GENERATED', false, false],
    ['FAILED', false, false],
    ['GENERATING', false, true],
    ['PENDING', true, true],
    ['GENERATED', true, true],
    ['FAILED', true, true],
    ['GENERATING', true, true],
  ] as const)('clipStatus=%s・送信中=%s のとき %s', (clipStatus, isSubmitting, expected) => {
    expect(isClipEditLocked(clipStatus, isSubmitting)).toBe(expected);
  });
});
