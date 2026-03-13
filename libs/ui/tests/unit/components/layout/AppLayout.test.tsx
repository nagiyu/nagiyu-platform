import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import AppLayout from '../../../../src/components/layout/AppLayout';

jest.mock('@mui/material-nextjs/v16-appRouter', () => ({
  AppRouterCacheProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('AppLayout', () => {
  function ThemeConsumer() {
    return <div>AppLayout Child</div>;
  }

  it('子要素を描画する', () => {
    render(
      <AppLayout>
        <ThemeConsumer />
      </AppLayout>
    );

    expect(screen.getByText('AppLayout Child')).toBeInTheDocument();
  });
});
