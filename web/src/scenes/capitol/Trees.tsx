import { useMemo } from "react";
import { DoubleSide, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { Forest } from "../common/impostors";
import { conifer, deciduous } from "../common/treeShapes";
import { groundY, hash, MAP } from "./data";
import { barkTexture, leafTexture } from "./textures";

// Every tree mapped in OpenStreetMap: elms, oaks and maples on the Capitol
// lawns and honey locusts along the sidewalks, plus a few conifers. Each is a
// trunk and limbs with a crown of leaf-cluster cards; the cards' normals
// point out from the crown's centre so it shades as one soft mass.

const VARIANTS = 3;

export default function Trees() {
  const { kinds, placed } = useMemo(() => {
    const bark = new MeshStandardMaterial({ map: barkTexture(), roughness: 0.95 });
    const leafMat = (seed: number, hues: [number, number]) =>
      new MeshStandardMaterial({ map: leafTexture(seed, hues), alphaTest: 0.45, side: DoubleSide, roughness: 0.85 });
    const kinds = [
      ...Array.from({ length: VARIANTS }, (_, i) => ({ ...deciduous(10 + i), bark, leaf: leafMat(40 + i, [78 + i * 8, 108 + i * 6]) })),
      { ...conifer(20), bark, leaf: leafMat(50, [120, 150]) },
    ];
    const placed: Matrix4[][] = kinds.map(() => []);
    for (const [x, z, needle] of MAP.trees) {
      const r = hash(x, z);
      const k = needle ? VARIANTS : Math.floor(r * VARIANTS);
      const scale = 0.72 + hash(z, x) * 0.5;
      const m = new Matrix4().compose(
        new Vector3(x, groundY(x, z), z),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), r * Math.PI * 2),
        new Vector3(scale, scale * (0.9 + hash(x + 1, z) * 0.2), scale),
      );
      placed[k].push(m);
    }
    return { kinds, placed };
  }, []);
  const forest = useMemo(() => kinds.map((k, i) => ({ wood: k.wood, leaves: k.leaves, bark: k.bark, leaf: k.leaf, matrices: placed[i] })), [kinds, placed]);
  // Past NEAR metres (beyond the shadow camera's patch around the car) each
  // tree is drawn as an impostor.
  return <Forest kinds={forest} near={NEAR} shadows />;
}

const NEAR = 85;
