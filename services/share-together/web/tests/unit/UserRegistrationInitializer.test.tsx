import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import UserRegistrationInitializer from '@/components/UserRegistrationInitializer';

describe('UserRegistrationInitializer', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    window.sessionStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: originalFetch,
    });
  });

  it('未登録時にユーザー登録 API を 1 回だけ実行する', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });

    render(<UserRegistrationInitializer />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/users', { method: 'POST' });
    });
    expect(window.sessionStorage.getItem('share-together:user-registration-completed')).toBe(
      'true'
    );
  });

  it('登録済みフラグがある場合は API を呼ばない', async () => {
    const fetchMock = jest.fn();
    Object.defineProperty(globalThis, 'fetch', {
      writable: true,
      value: fetchMock,
    });
    window.sessionStorage.setItem('share-together:user-registration-completed', 'true');

    render(<UserRegistrationInitializer />);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
