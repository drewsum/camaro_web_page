import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Box3, Group, Mesh, Vector3 } from "three";
import { CREDITS, type Credit } from "../credits";

// Other classic cars, loaded at runtime from public GitHub repos (pinned to a
// commit) rather than committed here. Each is a Sketchfab export whose
// license requires credit; see `credit`.

export interface ClassicCarDef {
  url: string;
  length: number; // real-world bumper-to-bumper length in metres
  yaw: number; // extra turn so the nose faces +Z after auto-orientation
  credit: Credit;
}

const raw = (repo: string, sha: string, path: string) => `https://raw.githubusercontent.com/${repo}/${sha}/${path}`;

export const CLASSIC_CARS = {
  chevelle: {
    url: raw("gibranalfarabi/portofolio-ar", "8591516383f4d51db0a1de6f4967a7450fc137c9", "assets/3D-model/chevrolet_chevelle_ss/scene.gltf"),
    length: 5.0,
    yaw: 0,
    credit: CREDITS.chevelle,
  },
  challenger: {
    url: raw("Omkar7637/OpenGL_Projects", "91f960eae2218260a8d077ba9f04ed15ccc36504", "01-Windows/03-PP/Model_Loading/1970_dodge_challenger_rt/scene.gltf"),
    length: 4.86,
    yaw: 0,
    credit: CREDITS.challenger,
  },
  mustang: {
    url: raw("manips1/CrossyroadinRealWorld", "65e9464f7fdcb2c8a51459065f729853d39776d9", "models/mustang/scene.gltf"),
    length: 4.61,
    yaw: 0,
    credit: CREDITS.mustang,
  },
} satisfies Record<string, ClassicCarDef>;

export type ClassicCarId = keyof typeof CLASSIC_CARS;

// The model sized to its real length, nose toward +Z, centred on the origin
// with the tyres on y = 0. Returns a fresh copy each time so a scene can
// place several.
export function useClassicCar(id: ClassicCarId) {
  const def: ClassicCarDef = CLASSIC_CARS[id];
  const { scene } = useGLTF(def.url);
  return useMemo(() => {
    const model = scene.clone(true);
    model.traverse((o) => {
      if (o instanceof Mesh) o.castShadow = true;
    });
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
