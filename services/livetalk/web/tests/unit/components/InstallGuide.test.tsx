import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InstallGuide from '@/components/InstallGuide';
import { snoozeInstallGuide, detectPlatform } from '@/lib/pwa/standalone';

jest.mock('@/lib/pwa/standalone', () => ({
  detectPlatform: jest.fn().mockReturnValue('ios'),
  snoozeInstallGuide: jest.fn(),
  snoozeNotificationPermission: jest.fn(),
}));

jest.mock('@/lib/pwa/messages', () => ({
  PWA_MESSAGES: {
    ANDROID_INSTALL_BUTTON: 'ホーム画面に追加する',
    SKIP: 'あとでね',
  },
}));

const mockDetectPlatform = detectPlatform as jest.Mock;
const mockSnoozeInstallGuide = snoozeInstallGuide as jest.Mock;

afterEach(() => {
  jest.clearAllMocks();
});

describe('InstallGuide（iOS）', () => {
  beforeEach(() => {
    mockDetectPlatform.mockReturnValue('ios');
  });

  it('iOS の手順案内が表示される', () => {
    render(<InstallGuide onSkip={jest.fn()} />);
    expect(screen.getByText('（共有ボタン）をタップ')).toBeInTheDocument();
    expect(screen.getByText('「ホーム画面に追加」を選んでね')).toBeInTheDocument();
  });

  it('Android のインストールボタンは表示されない', () => {
    render(<InstallGuide onSkip={jest.fn()} />);
    expect(screen.queryByText('ホーム画面に追加する')).not.toBeInTheDocument();
  });

  it('「あとでね」クリックで snoozeInstallGuide が呼ばれ onSkip が呼ばれる', () => {
    const onSkip = jest.fn();
    render(<InstallGuide onSkip={onSkip} />);
    fireEvent.click(screen.getByText('あとでね'));
    expect(mockSnoozeInstallGuide).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe('InstallGuide（Android）', () => {
  beforeEach(() => {
    mockDetectPlatform.mockReturnValue('android');
  });

  it('インストールボタンが表示される', () => {
    render(<InstallGuide onSkip={jest.fn()} />);
    expect(screen.getByText('ホーム画面に追加する')).toBeInTheDocument();
  });

  it('iOS 手順案内は表示されない', () => {
    render(<InstallGuide onSkip={jest.fn()} />);
    expect(screen.queryByText('（共有ボタン）をタップ')).not.toBeInTheDocument();
  });

  it('beforeinstallprompt なしでインストールボタンを押すと skip 扱いになる', () => {
    const onSkip = jest.fn();
    render(<InstallGuide onSkip={onSkip} />);
    fireEvent.click(screen.getByText('ホーム画面に追加する'));
    expect(onSkip).toHaveBeenCalled();
  });

  it('beforeinstallprompt でインストール承認後に snooze と onSkip が呼ばれる', async () => {
    const onSkip = jest.fn();
    render(<InstallGuide onSkip={onSkip} />);

    const event = new Event('beforeinstallprompt');
    (event as unknown as { prompt: jest.Mock; userChoice: Promise<{ outcome: string }> }).prompt =
      jest.fn().mockResolvedValue(undefined);
    (
      event as unknown as { prompt: jest.Mock; userChoice: Promise<{ outcome: string }> }
    ).userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);

    fireEvent.click(screen.getByText('ホーム画面に追加する'));

    await waitFor(() => {
      expect(mockSnoozeInstallGuide).toHaveBeenCalledTimes(1);
      expect(onSkip).toHaveBeenCalledTimes(1);
    });
  });

  it('インストール拒否では snooze も onSkip も呼ばれない', async () => {
    const onSkip = jest.fn();
    render(<InstallGuide onSkip={onSkip} />);

    const event = new Event('beforeinstallprompt');
    (event as unknown as { prompt: jest.Mock; userChoice: Promise<{ outcome: string }> }).prompt =
      jest.fn().mockResolvedValue(undefined);
    (
      event as unknown as { prompt: jest.Mock; userChoice: Promise<{ outcome: string }> }
    ).userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(event);

    fireEvent.click(screen.getByText('ホーム画面に追加する'));

    await waitFor(() => {
      expect(mockSnoozeInstallGuide).not.toHaveBeenCalled();
      expect(onSkip).not.toHaveBeenCalled();
    });
  });
});
