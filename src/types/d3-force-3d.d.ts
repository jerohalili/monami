declare module "d3-force-3d" {
  interface PositionForce {
    (alpha: number): void;
    strength(fn: (node: object) => number): PositionForce;
    x?(fn: (node: object) => number): PositionForce;
    y?(fn: (node: object) => number): PositionForce;
    initialize?(nodes: object[], ...args: unknown[]): void;
  }

  export function forceX(fn?: (node: object) => number): PositionForce;
  export function forceY(fn?: (node: object) => number): PositionForce;
}
