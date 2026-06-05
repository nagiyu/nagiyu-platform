import { ulid } from 'ulid';

/**
 * ULID 生成関数を抽象化するためのインターフェース。
 * リポジトリ実装に DI 可能にしてテストで決定論的な ID を発行するための薄いラッパー。
 */
export type UlidFactory = (seedTime?: number) => string;

/**
 * デフォルト実装。Phase 2a では `ulid` パッケージをそのまま使う。
 */
export const defaultUlidFactory: UlidFactory = (seedTime) => ulid(seedTime);
