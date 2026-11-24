import { use, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three-stdlib"; // the one drei uses, so it is not bundled twice
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Frustum,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Sphere,
  Vector3,
  type Material,
} from "three";
import assets from "./polyHavenAssets.json";
import { fadedMaterial } from "./dither";
import { MeshoptSimplifier } from "three/examples/jsm/libs/meshopt_simplifier.module.js";

// CC0 models from Poly Haven (1k textures), downloaded at build time by
// scripts/polyhaven.mjs (list them in polyHavenAssets.json) with their
// textures as WebP beside the .gltf.

export function polyHavenModel(name: string) {
  if (!assets.models.includes(name)) throw new Error(`Add the model ${name} to polyHavenAssets.json (then restart the dev server)`);
  return `/ph/models/${name}/${name}.gltf`;
}

// A loader class of its own rather than drei's useGLTF, which shares one
// GLTFLoader with the car models. It loads on three's default manager, so the
// downloads count toward the page's loading bar. (The CDN's layout once needed
// a URL-rewriting manager here; moving the shared loader onto it left any car
// model still downloading unfinished on the bar, stuck at "Loading 97%".)
class PolyHavenGLTFLoader extends GLTFLoader {}

// Starts a model downloading before the component that uses it mounts.
export function preloadPolyHavenModel(url: string) {
  useLoader.preload(PolyHavenGLTFLoader, url);
}

export interface ModelPart {
  geometry: BufferGeometry;
  material: Material;
}

// Flattens a glTF into geometry/material pairs with node transforms baked in,
// ready to instance. `bounds` is the model's extent in its own units.
export function useModelParts(url: string) {
  const { scene } = useLoader(PolyHavenGLTFLoader, url);
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

// ---- Levels of detail -------------------------------------------------------

// A part's geometry with its triangles cut to about `ratio` of the original,
// sharing the original's vertex data. meshoptimizer's "sloppy" simplifier
// ignores topology, which suits scanned foliage and rock seen from afar: it
// keeps the overall mass and silhouette rather than every leaf.
function simplified(geometry: BufferGeometry, ratio: number) {
  if (ratio >= 1 || !geometry.index) return geometry;
  const pos = geometry.attributes.position;
  const positions = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) positions.set([pos.getX(i), pos.getY(i), pos.getZ(i)], i * 3);
  const indices = new Uint32Array(geometry.index.array);
  const target = Math.max(3, Math.floor((indices.length * ratio) / 3) * 3);
  const [out] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target, 0.02);
  const g = new BufferGeometry();
  for (const [name, attr] of Object.entries(geometry.attributes)) g.setAttribute(name, attr);
  g.setIndex(new BufferAttribute(out, 1));
  return g;
}

export interface Level {
  ratio: number; // share of the model's triangles drawn at this level
  upTo: number; // used out to this distance from the camera's to the instance's centre, in metres
  blend?: number; // metres before upTo over which it dissolves into the next level (or into nothing); default a fifth of upTo
}

const blendOf = (l: Level) => l.blend ?? l.upTo * 0.2;

const frustum = new Frustum();
const projView = new Matrix4();
const worldMatrix = new Matrix4();
const centre = new Vector3();

// Every part of a model once per matrix, like InstancedModel, but each
// instance is drawn at the level of detail its distance from the camera
// calls for, and not at all when out of view or beyond the last level.
// Within lend metres of a level's limit an instance is drawn at both that
// level and the next, dithered between them (see dither.ts), so neither the
// switch nor the last level's cut-off pops. The
// choice is made per instance every frame (a few thousand distance checks),
// so there's one draw call per part per level however many instances there
// are, and nothing out of view is drawn.
export function LodInstancedModel({ parts, bounds, matrices, levels }: { parts: ModelPart[]; bounds: Box3; matrices: Matrix4[]; levels: Level[] }) {
  use(MeshoptSimplifier.ready);
  const group = useRef<Group>(null);
  const built = useMemo(() => {
    const radius = bounds.getBoundingSphere(new Sphere()).radius;
    const local = bounds.getCenter(new Vector3());
    const instances = matrices.map((m) => ({
      matrix: m.elements,
      centre: local.clone().applyMatrix4(m),
      radius: radius * m.getMaxScaleOnAxis(),
    }));
    const meshes = levels.map((level, k) =>
      parts.map((p) => {
        const before = levels[k - 1];
        const material = fadedMaterial(p.material, {
          fadeIn: before ? [before.upTo - blendOf(before), before.upTo] : undefined,
          fadeOut: [level.upTo - blendOf(level), level.upTo],
          centre: local,
        });
        const mesh = new InstancedMesh(simplified(p.geometry, level.ratio), material, matrices.length);
        mesh.frustumCulled = false; // culled per instance below
        mesh.count = 0;
        return mesh;
      }),
    );
    return { instances, meshes };
  }, [parts, bounds, matrices, levels]);

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    worldMatrix.copy(g.matrixWorld);
    frustum.setFromProjectionMatrix(projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const scale = worldMatrix.getMaxScaleOnAxis();
    const counts = levels.map(() => 0);
    const sphere = new Sphere();
    for (const inst of built.instances) {
      centre.copy(inst.centre).applyMatrix4(worldMatrix);
      sphere.set(centre, inst.radius * scale);
      if (!frustum.intersectsSphere(sphere)) continue;
      const d = centre.distanceTo(camera.position);
      levels.forEach((l, k) => {
        const before = levels[k - 1];
        if (d > l.upTo || (before && d < before.upTo - blendOf(before))) return;
        const slot = counts[k]++;
        for (const mesh of built.meshes[k]) mesh.instanceMatrix.array.set(inst.matrix, slot * 16);
      });
    }
    built.meshes.forEach((row, k) => {
      for (const mesh of row) {
        mesh.count = counts[k];
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, counts[k] * 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
    });
  });

  return (
    <group ref={group}>
      {built.meshes.flat().map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
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
