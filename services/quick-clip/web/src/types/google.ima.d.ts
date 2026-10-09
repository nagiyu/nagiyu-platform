// Google IMA HTML5 SDK 型宣言
// @types/google.ima は npm に存在しないため、ローカルで型定義を提供する
// 参考: https://developers.google.com/interactive-media-ads/docs/sdks/html5/client-side/reference/js/

declare namespace google {
  namespace ima {
    class AdDisplayContainer {
      constructor(adContainer: HTMLElement, videoContent?: HTMLVideoElement);
      public initialize(): void;
      public destroy(): void;
    }

    class AdsLoader {
      constructor(adDisplayContainer: AdDisplayContainer);
      public requestAds(adsRequest: AdsRequest): void;
      public contentComplete(): void;
      public destroy(): void;
      public addEventListener(
        event: typeof AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
        handler: (event: AdsManagerLoadedEvent) => void,
        useCapture?: boolean
      ): void;
      public addEventListener(
        event: typeof AdErrorEvent.Type.AD_ERROR,
        handler: (event: AdErrorEvent) => void,
        useCapture?: boolean
      ): void;
    }

    class AdsManager {
      public init(width: number, height: number, viewMode: ViewMode): void;
      public start(): void;
      public destroy(): void;
      public addEventListener(
        event: string,
        handler: (event: AdEvent | AdErrorEvent) => void,
        useCapture?: boolean
      ): void;
    }

    class AdsRequest {
      public adTagUrl: string;
      public linearAdSlotWidth: number;
      public linearAdSlotHeight: number;
      public nonLinearAdSlotWidth: number;
      public nonLinearAdSlotHeight: number;
    }

    class AdsManagerLoadedEvent {
      public static Type: {
        readonly ADS_MANAGER_LOADED: string;
      };
      public getAdsManager(
        content: HTMLVideoElement,
        adsRenderingSettings?: AdsRenderingSettings
      ): AdsManager;
    }

    class AdEvent {
      public static Type: {
        readonly COMPLETE: string;
        readonly SKIPPED: string;
        readonly ALL_ADS_COMPLETED: string;
      };
    }

    class AdErrorEvent {
      public static Type: {
        readonly AD_ERROR: string;
      };
      public getError(): AdError;
    }

    class AdError {
      public getMessage(): string;
    }

    class AdsRenderingSettings {}

    type ViewMode = 'normal' | 'fullscreen';

    const ViewMode: {
      readonly NORMAL: 'normal';
      readonly FULLSCREEN: 'fullscreen';
    };
  }
}
