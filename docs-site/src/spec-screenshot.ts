/**
 * 仕様カードに載せるスクリーンショットの、端末・ファイル名・置き場所の決め事。
 * ブラウザを動かす撮影本体 (capture/) から切り離し、ここだけを単体テストする。
 */

/** 撮影する端末の種類 */
export type DeviceId = 'mobile' | 'desktop';

export interface DeviceSpec {
  width: number;
  height: number;
  /** 文字が潰れない程度に上げつつ、画像サイズが膨らまない値にする */
  deviceScaleFactor: number;
  isMobile: boolean;
}

export const DEVICES: Record<DeviceId, DeviceSpec> = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false },
};

/** 画像の置き場所 (リポジトリルートからの相対パス) */
export const IMAGE_ROOT = 'docs/images/specs';

export const ERROR_MESSAGES = {
  INVALID_NAME: (label: string, value: string) =>
    `${label} は小文字の英数字とハイフンだけで書いてください: ${value}`,
  DUPLICATE_IMAGE: (fileName: string) => `同じ画像名が複数の撮影に使われています: ${fileName}`,
  NO_DEVICE: (service: string) => `${service} の撮影に使う端末がありません`,
} as const;

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function assertName(label: string, value: string): void {
  if (!NAME_PATTERN.test(value)) {
    throw new Error(ERROR_MESSAGES.INVALID_NAME(label, value));
  }
}

/** `<画面>-<状態>-<端末>.png`。何の画像かがファイル名だけでわかるようにする。 */
export function imageFileName(screen: string, state: string, device: DeviceId): string {
  assertName('画面名', screen);
  assertName('状態名', state);
  return `${screen}-${state}-${device}.png`;
}

/** 画像のリポジトリルートからのパス */
export function imageRepoPath(service: string, kind: string, fileName: string): string {
  assertName('サービス名', service);
  assertName('種別', kind);
  return `${IMAGE_ROOT}/${service}/${kind}/${fileName}`;
}

/**
 * カード (`docs/specs/<service>/<kind>/<name>.md`) から画像への相対リンク。
 * カードの深さは種別ごとに同じなので、固定の段数で上がる。
 */
export function cardImageLink(service: string, kind: string, fileName: string): string {
  return `../../../${imageRepoPath(service, kind, fileName).replace(/^docs\//, '')}`;
}

/** 同じ端末・画面・状態の組が重なっていないかを確かめる。重なると後の撮影が前の画像を上書きする。 */
export function assertUniqueImages(fileNames: string[]): void {
  const seen = new Set<string>();
  for (const fileName of fileNames) {
    if (seen.has(fileName)) {
      throw new Error(ERROR_MESSAGES.DUPLICATE_IMAGE(fileName));
    }
    seen.add(fileName);
  }
}

/** 設定の端末名の並びから、撮影する端末を取り出す。空なら設定ミスとして止める。 */
export function resolveDevices(service: string, devices: DeviceId[]): DeviceId[] {
  if (devices.length === 0) {
    throw new Error(ERROR_MESSAGES.NO_DEVICE(service));
  }
  return [...new Set(devices)];
}
