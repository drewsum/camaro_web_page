import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Box3, Group, Mesh, Vector3 } from "three";
import { CREDITS, type Credit } from "../credits";
import { DRACO_URL, dropTransmission } from "../../components/CamaroModel";
import { markCar } from "../../car/layers";

// Other classic cars. Each is a Sketchfab export whose license requires
// credit; see `credit`.
//
// challenger.glb is Omkar7637/OpenGL_Projects@91f960e's
// 01-Windows/03-PP/Model_Loading/1970_dodge_challenger_rt/scene.gltf (16.5 MB,
// once fetched from GitHub at runtime) made into a 3.4 MB GLB:
//   npx @gltf-transform/cli@4 draco scene.gltf challenger.glb --quantize-position 14 --quantize-normal 12 --quantize-texcoord 12
//   node scripts/optimize-glb.mjs public/models/challenger.glb

export interface ClassicCarDef {
  url: string;
  length: number; // real-world bumper-to-bumper length in metres
  yaw: number; // extra turn so the nose faces +Z after auto-orientation
  credit: Credit;
}

export const CLASSIC_CARS = {
  challenger: {
    url: "/models/challenger.glb",
    length: 4.86,
    yaw: 0,
    credit: CREDITS.challenger,
  },
} satisfies Record<string, ClassicCarDef>;

export type ClassicCarId = keyof typeof CLASSIC_CARS;

// The model sized to its real length, nose toward +Z, centred on the origin
// with the tyres on y = 0. Returns a fresh copy each time so a scene can
// place several.
export function useClassicCar(id: ClassicCarId) {
  const def: ClassicCarDef = CLASSIC_CARS[id];
  const { scene } = useGLTF(def.url, DRACO_URL);
  return useMemo(() => {
    const model = scene.clone(true);
    model.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      o.castShadow = true;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) dropTransmission(m);
    });
    markCar(model);
    // Fit in a wrapper so Sketchfab's own root rotation (Z-up) is left alone.
    const fit = new Group();
    fit.add(model);
    const holder = new Group();
    holder.add(fit);
    const measure = () => {
      holder.updateMatrixWorld(true);
      return new Box3().setFromObject(fit);
    };
    let size = measure().getSize(new Vector3());
    fit.rotation.y = (size.x > size.z ? Math.PI / 2 : 0) + def.yaw; // long axis along Z
    size = measure().getSize(new Vector3());
    fit.scale.setScalar(def.length / size.z);
    const box = measure();
    const centre = box.getCenter(new Vector3());
    fit.position.set(-centre.x, -box.min.y, -centre.z);
    return holder;
  }, [scene, def]);
}

export function ClassicCar({ id, position, rotationY = 0 }: { id: ClassicCarId; position: [number, number]; rotationY?: number }) {
  const car = useClassicCar(id);
  return <primitive object={car} position={[position[0], 0, position[1]]} rotation-y={rotationY} />;
}
