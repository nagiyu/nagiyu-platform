import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { useTheme } from '@mui/material/styles';
import ThemeRegistry from '@/components/ThemeRegistry';

jest.mock('@mui/material-nextjs/v16-appRouter', () => ({
  AppRouterCacheProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('ThemeRegistry', () => {
  function ThemeConsumer() {
    const muiTheme = useTheme();
    return <div>{muiTheme.palette.primary.main}</div>;
  }

  it('子要素を描画する', () => {
    render(
      <ThemeRegistry>
        <div>ThemeRegistry Child</div>
      </ThemeRegistry>
    );

    expect(screen.getByText('ThemeRegistry Child')).toBeInTheDocument();
  });

  it('MUI テーマと CssBaseline を適用する', () => {
    render(
      <ThemeRegistry>
        <ThemeConsumer />
      </ThemeRegistry>
    );

    expect(screen.getByText('#1565c0')).toBeInTheDocument();
    expect(document.head.querySelector('style[data-emotion="css-global"]')).toBeInTheDocument();
  });
});
