/**
 * quick-clip の型定義。
 * コアパッケージ（@nagiyu/quick-clip-core）から re-export する。
 * web 専用の型はこのファイルに追加する。
 */
export type {
  JobStatus,
  BatchStage,
  HighlightStatus,
  ClipStatus,
  HighlightSource,
  Job,
  Highlight,
  UpdateHighlightInput,
  TranscriptSegment,
} from '@nagiyu/quick-clip-core';
