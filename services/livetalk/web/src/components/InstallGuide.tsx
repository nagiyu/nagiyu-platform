'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import IosShareIcon from '@mui/icons-material/IosShare';
import AddBoxIcon from '@mui/icons-material/AddBox';
import { Button } from '@nagiyu/ui';
import { detectPlatform, snoozeInstallGuide } from '@/lib/pwa/standalone';
import { PWA_MESSAGES } from '@/lib/pwa/messages';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallGuideProps {
  onSkip: () => void;
}

export default function InstallGuide({ onSkip }: InstallGuideProps) {
  const platform = detectPlatform();
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleSkip = useCallback(() => {
    snoozeInstallGuide();
    onSkip();
  }, [onSkip]);

  const handleAndroidInstall = useCallback(async () => {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent) {
      handleSkip();
      return;
    }
    setInstalling(true);
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        snoozeInstallGuide();
        onSkip();
      }
    } finally {
      setInstalling(false);
      deferredPromptRef.current = null;
    }
  }, [handleSkip, onSkip]);

  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {platform === 'ios' ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">①</Typography>
            <IosShareIcon fontSize="small" color="primary" />
            <Typography variant="body2">（共有ボタン）をタップ</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">②</Typography>
            <AddBoxIcon fontSize="small" color="primary" />
            <Typography variant="body2">「ホーム画面に追加」を選んでね</Typography>
          </Box>
        </Box>
      ) : (
        <Button
          variant="outline"
          onClick={handleAndroidInstall}
          loading={installing}
          disabled={installing}
        >
          {PWA_MESSAGES.ANDROID_INSTALL_BUTTON}
        </Button>
      )}
      <Box sx={{ textAlign: 'center' }}>
        <Button variant="ghost" size="sm" onClick={handleSkip}>
          {PWA_MESSAGES.SKIP}
        </Button>
      </Box>
    </Paper>
  );
}
