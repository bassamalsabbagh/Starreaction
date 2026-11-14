// The one Node function the tests read source files with (tests/unit/styles/tokens.test.ts).
// Declared here instead of adding all Node types to the program, so src/ can't use Node globals.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  /** Raw bytes (tests/unit/services/mapLayers.test.ts reads the built value tiles). */
  export function readFileSync(path: string): Uint8Array;
  export function existsSync(path: string): boolean;
}
