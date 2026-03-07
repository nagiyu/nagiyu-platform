import '@testing-library/jest-dom';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout, { metadata } from '@/app/layout';

jest.mock('@/components/ServiceWorkerRegistration', () => ({
  __esModule: true,
  default: () => <div>ServiceWorkerRegistration</div>,
}));

jest.mock('@/components/ThemeRegistry', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
