import '@testing-library/jest-dom';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout, { metadata } from '@/app/layout';

jest.mock('@nagiyu/ui', () => ({
  __esModule: true,
  ...jest.requireActual('@nagiyu/ui'),
  ServiceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ServiceWorkerRegistration: () => <div>ServiceWorkerRegistration</div>,
}));

jest.mock('@/components/UserRegistrationInitializer', () => ({
  __esModule: true,
  default: () => <div>UserRegistrationInitializer</div>,
}));

describe('RootLayout', () => {
  it('manifest.json をメタデータに設定する', () => {
    expect(metadata.manifest).toBe('/manifest.json');
  });

  it('ServiceWorkerRegistration・UserRegistrationInitializer と子要素を描画する', () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <div>RootLayout Child</div>
      </RootLayout>
    );

    expect(html).toContain('ServiceWorkerRegistration');
    expect(html).toContain('UserRegistrationInitializer');
    expect(html).toContain('RootLayout Child');
  });
});
