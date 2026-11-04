import { formatHighlightTime, parseHighlightTime } from '@/lib/highlight-time';

describe('formatHighlightTime', () => {
  it.each([
    [0, '0:00'],
    [10, '0:10'],
    [70.5, '1:10'],
    [80.25, '1:20'],
    [59.99, '0:59'],
    [600, '10:00'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [-5, '0:00'],
  ])('%p 秒は %p になる', (input, expected) => {
    expect(formatHighlightTime(input)).toBe(expected);
  });
});

describe('parseHighlightTime', () => {
  it.each([
    ['1:10', 70],
    ['0:05', 5],
    ['1:2', 62],
    ['1:02:05', 3725],
    ['100:00:00', 360000],
    ['70', 70],
    ['0', 0],
    ['70.5', 70.5],
    ['1:10.5', 70.5],
    [' 1:10 ', 70],
  ])('%p は %p 秒になる', (input, expected) => {
    expect(parseHighlightTime(input)).toBe(expected);
  });

  it.each([
    [''],
    ['  '],
    ['abc'],
    ['-5'],
    ['-1:10'],
    ['1:75'],
    ['1:60'],
    ['61:00'],
    ['1:61:00'],
    ['1:02:60'],
    ['1:2:3:4'],
    [':10'],
    ['1:'],
    ['1::10'],
    ['1.5:10'],
    ['1e3'],
    ['.5'],
  ])('%p は不正として null になる', (input) => {
    expect(parseHighlightTime(input)).toBeNull();
  });
});
