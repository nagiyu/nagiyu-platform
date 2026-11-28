import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import HomeHeroSection from '@/components/HomeHeroSection';
import AboutProfile from '@/components/AboutProfile';
import AboutPolicy from '@/components/AboutPolicy';
import AboutTimeline from '@/components/AboutTimeline';
import AboutPage from '@/app/about/page';
import ContactPage from '@/app/contact/page';

/** 和文の文字 (漢字・かな) と全角約物 */
const JA = String.raw`[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}、。「」『』（）・！？：；ー]`;
/** 全角の句読点・括弧・中黒 */
const JA_PUNCT = String.raw`[、。「」『』（）・！？：；]`;

/** 和文どうしの間の空白 */
const BETWEEN_JA = new RegExp(`${JA}\\s+${JA}`, 'u');
/** 全角約物の直後・直前の空白 */
const AROUND_PUNCT = new RegExp(`${JA_PUNCT}\\s|\\s${JA_PUNCT}`, 'u');

/**
 * 技術スタックの「項目名 - 説明」は半角ハイフンを区切りにする表記なので、
 * 区切りの前後の空白は判定から外す。
 */
const SEPARATOR = ' - ';

const cases: [string, () => ReactElement][] = [
  ['HomeHeroSection', () => <HomeHeroSection />],
  ['AboutPage', () => <AboutPage />],
  ['AboutProfile', () => <AboutProfile />],
  ['AboutPolicy', () => <AboutPolicy />],
  ['AboutTimeline', () => <AboutTimeline />],
  ['ContactPage', () => <ContactPage />],
];

/**
 * JSX 内で和文を途中改行すると、改行と字下げが空白 1 つとして描画される。
 * 和文どうしの間と全角約物の隣に空白が出ないことを確かめる。
 * 英字・数字と和文の境目の空白は表記として許す。
 */
describe('和文の描画に余計な空白が入らない', () => {
  it.each(cases)('%s の本文に和文どうしの間の空白がない', (_name, create) => {
    const { container } = render(create());
    const text = (container.textContent ?? '').replaceAll(SEPARATOR, '|');

    expect(text.match(BETWEEN_JA)?.[0]).toBeUndefined();
  });

  it.each(cases)('%s の本文に全角約物に隣接する空白がない', (_name, create) => {
    const { container } = render(create());
    const text = (container.textContent ?? '').replaceAll(SEPARATOR, '|');

    expect(text.match(AROUND_PUNCT)?.[0]).toBeUndefined();
  });
});
