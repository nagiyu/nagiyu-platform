/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { NOT_FOUND_VIEW_MESSAGES } from '@nagiyu/ui';
import NotFound from '@/app/not-found';

describe('NotFound', () => {
  it('既定の見出しとトップページへの導線を表示する', () => {
    render(createElement(NotFound));

    expect(
      screen.getByRole('heading', { level: 1, name: NOT_FOUND_VIEW_MESSAGES.DEFAULT_TITLE })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: NOT_FOUND_VIEW_MESSAGES.HOME_BUTTON })).toHaveAttribute(
      'href',
      '/'
    );
  });
});
