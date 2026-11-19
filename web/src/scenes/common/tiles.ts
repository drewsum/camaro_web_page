import { Group, InstancedMesh, LOD, Matrix4, Object3D, Vector3, type BufferGeometry, type Material } from "three";

// Instances spread over a whole map, split into square tiles of `cell`
// metres, one InstancedMesh each. A single map-wide InstancedMesh can never
// be frustum culled, so every instance is drawn every frame, in the main
// pass and again into the shadow map; tiles let both skip what's out of
// view (the shadow camera only covers the area around the car).
export function tiledInstances(
  geometry: BufferGeometry,
  material: Material,
  matrices: Matrix4[],
  cell: number,
  { castShadow = true, receiveShadow = true, hideBeyond }: { castShadow?: boolean; receiveShadow?: boolean; hideBeyond?: number } = {},
) {
  const tiles = new Map<string, Matrix4[]>();
  const p = new Vector3();
  for (const m of matrices) {
    p.setFromMatrixPosition(m);
    const key = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
    let list = tiles.get(key);
    if (!list) tiles.set(key, (list = []));
    list.push(m);
  }
  const group = new Group();
  for (const list of tiles.values()) {
    const mesh = new InstancedMesh(geometry, material, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    if (hideBeyond === undefined) {
      group.add(mesh);
      continue;
    }
    // Small detail that's sub-pixel far off: drop the tile past hideBeyond.
    // LOD measures from its own position, so put it at the tile's centre.
    const centre = mesh.boundingSphere!.center;
    const lod = new LOD();
    lod.position.copy(centre);
    mesh.position.copy(centre).negate();
    const holder = new Object3D();
    holder.add(mesh);
    lod.addLevel(holder, 0);
    lod.addLevel(new Object3D(), hideBeyond);
    group.add(lod);
  }
  return group;
}
