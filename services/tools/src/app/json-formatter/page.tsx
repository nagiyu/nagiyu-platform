import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'JSON 整形ツール - Tools',
  description: 'JSONの整形・圧縮・検証ができます',
};

import JsonFormatterClient from './JsonFormatterClient';

export default function JsonFormatterPage() {
  return <JsonFormatterClient />;
}
