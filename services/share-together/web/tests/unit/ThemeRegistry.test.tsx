import { render, screen } from '@testing-library/react';
import * as React from 'react';
import ThemeRegistry from '@/components/ThemeRegistry';

jest.mock('@mui/material-nextjs/v16-appRouter', () => ({
  AppRouterCacheProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('ThemeRegistry', () => {
  it('子要素を描画する', () => {
    render(
      <ThemeRegistry>
        <div>ThemeRegistry Child</div>
      </ThemeRegistry>
    );

    expect(screen.getByText('ThemeRegistry Child')).toBeTruthy();
  });
});
