/**
 * 自発リサーチで起点にした Topic の探索の記録。
 *
 * 探索の結果は別の Topic として集約されうるため、起点 Topic の WEB fact の観測日時は進まない。
 * 観測日時だけで間隔を空けると同じ起点を毎回探索してしまうので、探索した時刻と、
 * 重ねて同じ角度を選ばないための最近の角度を起点ごとに覚える。
 *
 * Topic の META は集約が楽観ロックで書き換えるため、META には足さず別のアイテムにする。
 *
 * DynamoDB SK: `CHAR#<charId>#EXPLORE#<topicId>`
 */
export interface ExplorationEntity {
  userId: string;
  characterId: string;
  /** 探索の起点にした Topic */
  topicId: string;
  /** 最後に探索を試した時刻 (Unix ms)。成否は問わない */
  exploredAt: number;
  /** 最近探索した角度 (Web 検索のクエリ)。新しい順で、件数は呼び出し側が切り詰める */
  recentAngles: string[];
  updatedAt: number;
}

export interface ExplorationKey {
  userId: string;
  characterId: string;
  topicId: string;
}

/** 記録の保存入力。`updatedAt` はリポジトリ側で付与する */
export type PutExplorationInput = Omit<ExplorationEntity, 'updatedAt'>;
