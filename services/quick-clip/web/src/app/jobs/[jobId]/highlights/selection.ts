export const clearSelectedIdIfHighlightMatches =
  (highlightId: string) =>
  (current: string | null): string | null =>
    current === highlightId ? null : current;
