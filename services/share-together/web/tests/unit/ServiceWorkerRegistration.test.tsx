import { render, waitFor } from '@testing-library/react';
import {
  ServiceWorkerRegistration,
  SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES as ERROR_MESSAGES,
} from '@nagiyu/ui';

describe('ServiceWorkerRegistration', () => {
  afterEach(() => {
    delete (navigator as Navigator & { serviceWorker?: unknown }).serviceWorker;
    jest.restoreAllMocks();
  });

  it('Service Worker を登録する', async () => {
    const update = jest.fn();
    const register = jest.fn().mockResolvedValue({
      update,
    });

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });

    render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith('/sw.js');
    });
    await waitFor(() => {
      expect(update).toHaveBeenCalledTimes(1);
    });
  });

  it('Service Worker 非対応環境では何もしない', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<ServiceWorkerRegistration />);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('Service Worker 登録失敗時はエラーを出力する', async () => {
    const register = jest.fn().mockRejectedValue(new Error('failed'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });

    render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        ERROR_MESSAGES.SERVICE_WORKER_REGISTRATION_FAILED,
        expect.any(Error)
      );
    });
  });
});
