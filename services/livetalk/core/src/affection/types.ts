export interface AffectionFactors {
  /** 情報開示量（この会話で発生した会話起因の C→B 昇格イベント数） */
  infoDisclosure: number;
  /** 今日が新規接触日か */
  isNewActiveDay: boolean;
}
