export type QuickClipCoreHealth = {
  readonly status: 'ok';
};

export const getQuickClipCoreHealth = (): QuickClipCoreHealth => ({
  status: 'ok',
});
