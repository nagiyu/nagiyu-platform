// next-auth（ESM）に依存するコンポーネントの置き場。
// @nagiyu/ui の barrel（index.ts）に混ぜると next-auth を使わないサービスにまで
// この依存が伝播するため、専用サブパス @nagiyu/ui/session-provider から named export で提供する。
// next-auth を使うサービス（auth-web / livetalk-web など）だけがこの依存を負う。
export { default as SessionProviderWrapper } from './components/providers/SessionProviderWrapper';
export type { SessionProviderWrapperProps } from './components/providers/SessionProviderWrapper';
export { default as SessionHeader } from './components/layout/SessionHeader';
export type { SessionHeaderProps } from './components/layout/SessionHeader';
