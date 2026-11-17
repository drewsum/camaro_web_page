import { useLayoutEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { Box3, LoadingManager, Mesh, type BufferGeometry, type InstancedMesh, type Loader, type Material, type Matrix4 } from "three";

// CC0 models from Poly Haven, fetched from their CDN at runtime (1k textures).

export function polyHavenModel(name: string) {
  return `https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/${name}/${name}_1k.gltf`;
}

// The .gltf files reference textures/<file> beside themselves, but the CDN
// serves those images from a parallel jpg/ tree.
const polyHavenTextures = new LoadingManager();
polyHavenTextures.setURLModifier((url) =>
  url.replace(/\/Models\/gltf\/(\w+)\/([^/]+)\/textures\//, "/Models/jpg/$1/$2/"),
);
const withPolyHavenPaths = (loader: Loader) => {
  loader.manager = polyHavenTextures;
};

export interface ModelPart {
  geometry: BufferGeometry;
  material: Material;
}

// Flattens a glTF into geometry/material pairs with node transforms baked in,
// ready to instance. `bounds` is the model's extent in its own units.
export function useModelParts(url: string) {
  const { scene } = useGLTF(url, false, false, withPolyHavenPaths);
  return useMemo(() => {
    scene.updateMatrixWorld(true);
    const parts: ModelPart[] = [];
    scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const geometry = (o.geometry as BufferGeometry).clone().applyMatrix4(o.matrixWorld);
      parts.push({ geometry, material: o.material as Material });
    });
    const bounds = new Box3();
    for (const p of parts) {
      p.geometry.computeBoundingBox();
      bounds.union(p.geometry.boundingBox!);
    }
    return { parts, bounds };
  }, [scene]);
}

// Draws every part of a model once per matrix.
export function InstancedModel({
  parts,
  matrices,
  castShadow = false,
  receiveShadow = false,
  visible = true,
}: {
  parts: ModelPart[];
  matrices: Matrix4[];
  castShadow?: boolean;
  receiveShadow?: boolean;
  visible?: boolean;
}) {
  return (
    <group visible={visible}>
      {parts.map((p, i) => (
        <InstancedPart key={i} part={p} matrices={matrices} castShadow={castShadow} receiveShadow={receiveShadow} />
      ))}
    </group>
  );
}

function InstancedPart({ part, matrices, castShadow, receiveShadow }: { part: ModelPart; matrices: Matrix4[]; castShadow: boolean; receiveShadow: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    matrices.forEach((mat, i) => m.setMatrixAt(i, mat));
    m.count = matrices.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices]);
  if (!matrices.length) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[part.geometry, part.material, matrices.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}
