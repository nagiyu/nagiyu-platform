import type { Metadata } from 'next';
import TimestampConverterClient from './TimestampConverterClient';

export const metadata: Metadata = {
  title: 'タイムスタンプ変換ツール - Tools',
  description:
    'Unixタイムスタンプ（秒/ミリ秒）と日時文字列を相互に変換できる無料ツールです。Stock Trackerで利用しているタイムゾーンに対応し、ブラウザ内で安全に変換できます。',
};

export default function TimestampConverterPage() {
  return <TimestampConverterClient />;
}
