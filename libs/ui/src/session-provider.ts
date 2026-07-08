// next-auth（ESM）依存を @nagiyu/ui の barrel（index.ts）に混ぜないための専用サブパス。
// @nagiyu/ui/session-provider として named export で提供し、実際に next-auth を使う
// サービス（auth-web / livetalk-web）だけがこの依存を負う。
export { default as SessionProviderWrapper } from './components/providers/SessionProviderWrapper';
export type { SessionProviderWrapperProps } from './components/providers/SessionProviderWrapper';
