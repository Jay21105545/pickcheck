// `typescript` is installed and a tsconfig exists, so every surface signal
// says this project is type-checked. Nothing runs the compiler: `vite build`
// strips types without checking them, there is no `typecheck` script, and
// there is no CI. A type error here ships.
export function greet(name: string): string {
  return `hello ${name}`;
}
