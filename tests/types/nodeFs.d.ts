// The one Node function the tests read source files with (tests/unit/styles/tokens.test.ts).
// Declared here instead of adding all Node types to the program, so src/ can't use Node globals.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
