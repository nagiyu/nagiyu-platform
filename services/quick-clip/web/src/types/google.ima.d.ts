// Google IMA HTML5 SDK 型宣言
// @types/google.ima は npm に存在しないため、ローカルで型定義を提供する
// 参考: https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/reference/js/

declare namespace google {
  namespace ima {
    class AdDisplayContainer {
      constructor(adContainer: HTMLElement, videoContent?: HTMLVideoElement);
      initialize(): void;
      destroy(): void;
    }

    class AdsLoader {
      constructor(adDisplayContainer: AdDisplayContainer);
      requestAds(adsRequest: AdsRequest): void;
      contentComplete(): void;
      destroy(): void;
      addEventListener(
        event: typeof AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
        handler: (event: AdsManagerLoadedEvent) => void,
        useCapture?: boolean
      ): void;
      addEventListener(
        event: typeof AdErrorEvent.Type.AD_ERROR,
        handler: (event: AdErrorEvent) => void,
        useCapture?: boolean
      ): void;
    }

    class AdsManager {
      init(width: number, height: number, viewMode: ViewMode): void;
      start(): void;
      destroy(): void;
      addEventListener(
        event: string,
        handler: (event: AdEvent | AdErrorEvent) => void,
        useCapture?: boolean
      ): void;
    }

    class AdsRequest {
      adTagUrl: string;
      linearAdSlotWidth: number;
      linearAdSlotHeight: number;
      nonLinearAdSlotWidth: number;
      nonLinearAdSlotHeight: number;
    }

    class AdsManagerLoadedEvent {
      static Type: {
        readonly ADS_MANAGER_LOADED: string;
      };
      getAdsManager(
        content: HTMLVideoElement,
        adsRenderingSettings?: AdsRenderingSettings
      ): AdsManager;
    }

    class AdEvent {
      static Type: {
        readonly COMPLETE: string;
        readonly SKIPPED: string;
        readonly ALL_ADS_COMPLETED: string;
      };
    }

    class AdErrorEvent {
      static Type: {
        readonly AD_ERROR: string;
      };
      getError(): AdError;
    }

    class AdError {
      getMessage(): string;
    }

    class AdsRenderingSettings {}

    type ViewMode = 'normal' | 'fullscreen';

    const ViewMode: {
      readonly NORMAL: 'normal';
      readonly FULLSCREEN: 'fullscreen';
    };
  }
}
