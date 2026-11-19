import type { Mesh, Object3D } from "three";

// Car models are also on this layer, so a camera can render just the cars
// (CarContactShadows does). Everything stays on layer 0 as well, so the main
// camera and the sun's shadow map see them as usual.
export const CAR_LAYER = 2;

// Only the meshes that cast a shadow join the layer, so call this after
// setting castShadow: parts too small to show in the sun's shadow (see
// CamaroModel) are too small for the contact shadow too.
export function markCar(root: Object3D) {
  root.traverse((o) => {
    if ((o as Mesh).isMesh && o.castShadow) o.layers.enable(CAR_LAYER);
  });
}
