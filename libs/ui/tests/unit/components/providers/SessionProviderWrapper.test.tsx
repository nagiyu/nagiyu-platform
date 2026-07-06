import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';

// next-auth/react は ESM 配布のため、jest（ts-jest, node_modules 未変換）では
// そのまま import できない。SessionProvider は children をそのまま描画する薄い
// ラッパーであるため、同等の挙動のモックに差し替える。
const mockSessionProvider = jest.fn(({ children }: { children: ReactNode }) => children);
jest.mock('next-auth/react', () => ({
  SessionProvider: (props: { children: ReactNode }) => mockSessionProvider(props),
}));

import SessionProviderWrapper from '../../../../src/components/providers/SessionProviderWrapper';

describe('SessionProviderWrapper', () => {
  it('children をレンダリングする', () => {
    render(
      <SessionProviderWrapper>
        <div data-testid="child">child content</div>
      </SessionProviderWrapper>
    );

    expect(screen.getByTestId('child')).toHaveTextContent('child content');
  });

  it('複数の children を受け取れる', () => {
    render(
      <SessionProviderWrapper>
        <div data-testid="first">first</div>
        <div data-testid="second">second</div>
      </SessionProviderWrapper>
    );

    expect(screen.getByTestId('first')).toBeInTheDocument();
    expect(screen.getByTestId('second')).toBeInTheDocument();
  });

  it('next-auth の SessionProvider でラップする', () => {
    render(
      <SessionProviderWrapper>
        <div>content</div>
      </SessionProviderWrapper>
    );

    expect(mockSessionProvider).toHaveBeenCalled();
  });
});
