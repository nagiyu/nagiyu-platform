'use client';

import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';

export type VideoAdProps = {
  /** 広告完了（またはフォールバック）時に呼ばれるコールバック */
  onAdFinished: () => void;
};

const IMA_SDK_URL = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js';
const AD_WIDTH = 640;
const AD_HEIGHT = 360;
const NON_LINEAR_AD_HEIGHT = 150;

const loadImaSdk = (): Promise<typeof google.ima> =>
  new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.google?.ima) {
      resolve(window.google.ima);
      return;
    }
    const script = document.createElement('script');
    script.src = IMA_SDK_URL;
    script.async = true;
    script.onload = () => resolve(window.google.ima);
    script.onerror = reject;
    document.body.appendChild(script);
  });

export function VideoAd({ onAdFinished }: VideoAdProps) {
  const adContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onAdFinishedRef = useRef(onAdFinished);

  useEffect(() => {
    onAdFinishedRef.current = onAdFinished;
  }, [onAdFinished]);

  useEffect(() => {
    const vastTagUrl = process.env.NEXT_PUBLIC_VAST_TAG_URL;

    let active = true;
    let adsManager: google.ima.AdsManager | null = null;

    const finish = () => {
      if (active) {
        active = false;
        onAdFinishedRef.current();
      }
    };

    if (!vastTagUrl) {
      finish();
      return;
    }

    const adContainer = adContainerRef.current;
    const video = videoRef.current;

    /* c8 ignore next 4 */
    if (!adContainer || !video) {
      finish();
      return;
    }

    loadImaSdk()
      .then((ima) => {
        if (!active) return;

        const displayContainer = new ima.AdDisplayContainer(adContainer, video);
        displayContainer.initialize();

        const adsLoader = new ima.AdsLoader(displayContainer);

        adsLoader.addEventListener(
          ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
          (event: google.ima.AdsManagerLoadedEvent) => {
            if (!active) return;

            adsManager = event.getAdsManager(video);

            adsManager.addEventListener(ima.AdEvent.Type.COMPLETE, finish);
            adsManager.addEventListener(ima.AdEvent.Type.SKIPPED, finish);
            adsManager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, finish);
            adsManager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, finish);

            adsManager.init(AD_WIDTH, AD_HEIGHT, ima.ViewMode.NORMAL);
            adsManager.start();
          }
        );

        adsLoader.addEventListener(
          ima.AdErrorEvent.Type.AD_ERROR,
          (_event: google.ima.AdErrorEvent) => {
            finish();
          }
        );

        const adsRequest = new ima.AdsRequest();
        adsRequest.adTagUrl = vastTagUrl;
        adsRequest.linearAdSlotWidth = AD_WIDTH;
        adsRequest.linearAdSlotHeight = AD_HEIGHT;
        adsRequest.nonLinearAdSlotWidth = AD_WIDTH;
        adsRequest.nonLinearAdSlotHeight = NON_LINEAR_AD_HEIGHT;

        adsLoader.requestAds(adsRequest);
      })
      .catch(() => {
        finish();
      });

    return () => {
      active = false;
      adsManager?.destroy();
    };
  }, []);

  return (
    <Box
      sx={{
        position: 'relative',
        width: AD_WIDTH,
        maxWidth: '100%',
        aspectRatio: '16/9',
        bgcolor: 'black',
        mx: 'auto',
      }}
    >
      <Box ref={adContainerRef} sx={{ position: 'absolute', inset: 0, zIndex: 1 }} />
      <Box
        component="video"
        ref={videoRef}
        sx={{ width: '100%', height: '100%', display: 'block' }}
        muted
        playsInline
      />
    </Box>
  );
}
