import { render, screen } from '@testing-library/react';
import AppThemeProvider from '../../../../src/components/providers/AppThemeProvider';

describe('AppThemeProvider', () => {
  it('children をレンダリングする', () => {
    render(
      <AppThemeProvider>
        <div data-testid="child">child content</div>
      </AppThemeProvider>
    );

    expect(screen.getByTestId('child')).toHaveTextContent('child content');
  });

  it('CssBaseline が適用される（body 要素の margin がリセットされる）', () => {
    render(
      <AppThemeProvider>
        <div>content</div>
      </AppThemeProvider>
    );

    // CssBaseline は body の margin を 0 にする
    const bodyStyle = window.getComputedStyle(document.body);
    expect(bodyStyle.margin).toBe('0px');
  });

  it('複数の children を受け取れる', () => {
    render(
      <AppThemeProvider>
        <div data-testid="first">first</div>
        <div data-testid="second">second</div>
      </AppThemeProvider>
    );

    expect(screen.getByTestId('first')).toBeInTheDocument();
    expect(screen.getByTestId('second')).toBeInTheDocument();
  });
});
