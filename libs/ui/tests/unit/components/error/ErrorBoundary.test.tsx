import React from 'react';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../../../../src/components/error/ErrorBoundary';

function ThrowError(): React.ReactNode {
  throw new Error('test error');
}

describe('ErrorBoundary', () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  afterEach(() => {
    consoleErrorSpy.mockClear();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('エラーがない場合は children を表示する', () => {
    render(
      <ErrorBoundary>
        <div>child content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('エラー時に fallback を表示する', () => {
    render(
      <ErrorBoundary fallback={<div>fallback content</div>}>
        {React.createElement(ThrowError)}
      </ErrorBoundary>
    );

    expect(screen.getByText('fallback content')).toBeInTheDocument();
  });
});
