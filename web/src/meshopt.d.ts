// three ships meshoptimizer's simplifier without types; just what we use.
declare module "three/examples/jsm/libs/meshopt_simplifier.module.js" {
  export const MeshoptSimplifier: {
    ready: Promise<void>;
    supported: boolean;
    simplifySloppy(
      indices: Uint32Array,
      positions: Float32Array,
      stride: number,
      vertexLock: Uint8Array | null,
      targetIndexCount: number,
      targetError: number,
    ): [Uint32Array, number];
  };
}
