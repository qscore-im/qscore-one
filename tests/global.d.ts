// Type declarations for globals injected by backend.js into the browser context.
// Used by page.evaluate() callbacks in Playwright tests.

interface Window {
  backend: {
    mode: string;
    onMatches(fn: (matches: Record<string, any>) => void): void;
    onConnect(fn: () => void): void;
    onDisconnect(fn: () => void): void;
    createMatch(matchData: Record<string, any>): void;
    updateMatch(id: string, patch: Record<string, any>): void;
    replaceMatch(id: string, state: Record<string, any>): void;
    deleteMatch(id: string): void;
  };
}
