import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ThemeRegistry from '../../../components/ThemeRegistry';
import { useSession } from 'next-auth/react';

jest.mock('next-auth/react', () => {
  return {
    useSession: jest.fn(),
    signOut: jest.fn(),
    SessionProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock('@nagiyu/ui', () => {
  return {
    ErrorBoundary: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    ServiceLayout: ({
      children,
      headerProps,
    }: {
      children: React.ReactNode;
      headerProps?: { navigationItems?: unknown };
    }) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'pre',
          { 'data-testid': 'navigation-items' },
          JSON.stringify(headerProps?.navigationItems)
        ),
        children
      ),
    };
});

jest.mock('../../../components/SnackbarProvider', () => {
  return {
    SnackbarProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

describe('ThemeRegistry navigationItems', () => {
  const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>;
  const getNavigationItems = (html: string): Array<{ label: string; href: string }> => {
    const matched = html.match(/<pre data-testid="navigation-items">(.+)<\/pre>/);
    if (!matched) {
      return [];
    }
    return JSON.parse(matched[1].replace(/&quot;/g, '"'));
  };

  beforeEach(() => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: jest.fn(),
    });
  });

  it('stock-viewer ロール（stocks:read 権限あり）の場合にサマリー導線を表示する', () => {
    mockedUseSession.mockReturnValue({
      data: {
        user: {
          name: 'test-user',
          email: 'test@example.com',
          roles: ['stock-viewer'],
        },
        expires: '2099-01-01T00:00:00.000Z',
      },
      status: 'authenticated',
      update: jest.fn(),
    });

    const html = renderToStaticMarkup(
      React.createElement(ThemeRegistry, null, React.createElement('div', null, 'child'))
    );
    const navigationItems = getNavigationItems(html);
    expect(navigationItems).toContainEqual({ label: 'サマリー', href: '/summaries' });
  });

  it('user-manager ロール（stocks:read 権限なし）の場合にサマリー導線を表示しない', () => {
    mockedUseSession.mockReturnValue({
      data: {
        user: {
          name: 'test-user',
          email: 'test@example.com',
          roles: ['user-manager'],
        },
        expires: '2099-01-01T00:00:00.000Z',
      },
      status: 'authenticated',
      update: jest.fn(),
    });

    const html = renderToStaticMarkup(
      React.createElement(ThemeRegistry, null, React.createElement('div', null, 'child'))
    );
    const navigationItems = getNavigationItems(html);
    expect(navigationItems).not.toContainEqual({ label: 'サマリー', href: '/summaries' });
  });
});
