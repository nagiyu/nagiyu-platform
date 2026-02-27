import { render, waitFor } from '@testing-library/react';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';

describe('ServiceWorkerRegistration', () => {
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
});
