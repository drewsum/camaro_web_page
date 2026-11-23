import { DirectionalLight, Sphere, Vector3, type Light, type LightShadow, type PerspectiveCamera, type Scene } from "three";

// Sun shadows that reach as far as the camera looks.
//
// Each scene's sun is a directional light whose shadow map covers a fixed box
// round the car, small enough to keep the car's shadow crisp, so the shadows
// of scenery a few metres ahead simply stopped. Instead, every frame, each
// shadow-casting directional light's shadow box is fitted round the part of
// the view out to REACH metres, at a 4096² map: about 2.5 cm a texel, finer
// than the soft edge the shadows are given (PENUMBRA), so nearby shadows lose
// nothing.
//
// The box is sized from a sphere round that part of the view, so it stays the
// same size as the camera turns, and its centre is snapped to whole texels,
// so the shadows' edges don't crawl as the camera moves. The scenes' own
// shadow-camera bounds are replaced by this.

const REACH = 70; // m from the camera
const MAP = 4096;
const BEHIND = 150; // m toward the sun the box extends, so tall things up-sun still cast into it
const PENUMBRA = 0.05; // m of soft edge

const sphere = new Sphere();
const target = new Vector3();
const centre = new Vector3();
const points: Vector3[] = Array.from({ length: 8 }, () => new Vector3());

// The sphere round the camera's view from its near plane out to REACH.
function viewSphere(camera: PerspectiveCamera) {
  const ndcFar = new Vector3(0, 0, -REACH).applyMatrix4(camera.projectionMatrix).z;
  let i = 0;
  for (const z of [-1, Math.min(ndcFar, 1)])
    for (const x of [-1, 1])
      for (const y of [-1, 1]) points[i++].set(x, y, z).applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld);
  return sphere.setFromPoints(points);
}

let found: DirectionalLight[] = [];
let lookedAt = -1;

export function fitSunShadows(scene: Scene, camera: PerspectiveCamera, frame: number) {
  // Look the lights up now and then rather than walking the scene every frame.
  if (frame - lookedAt >= 30 || frame < lookedAt) {
    found = [];
    scene.traverse((o) => {
      if (o instanceof DirectionalLight && o.castShadow) found.push(o);
    });
    lookedAt = frame;
  }
  const lights = found.filter((l) => l.parent && l.castShadow);
  if (!lights.length) return;
  const s = viewSphere(camera);
  const radius = Math.ceil(s.radius);
  const texel = (2 * radius) / MAP;
  for (const light of lights) {
    const shadow = light.shadow;
    if (shadow.mapSize.x !== MAP) {
      shadow.mapSize.set(MAP, MAP);
      shadow.map?.dispose();
      shadow.map = null;
    }
    // The light stays where its scene put it; the shadow box is shifted
    // within the light's view to sit round the camera's view instead. This
    // sets up the shadow camera exactly as three will before rendering.
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
    const cam = shadow.camera;
    cam.position.setFromMatrixPosition(light.matrixWorld);
    cam.lookAt(target.setFromMatrixPosition(light.target.matrixWorld));
    cam.updateMatrixWorld();
    centre.copy(s.center).applyMatrix4(cam.matrixWorldInverse);
    // Whole texels, so edges don't crawl as the camera moves.
    const x = Math.round(centre.x / texel) * texel;
    const y = Math.round(centre.y / texel) * texel;
    cam.left = x - radius;
    cam.right = x + radius;
    cam.bottom = y - radius;
    cam.top = y + radius;
    cam.near = -centre.z - radius - BEHIND;
    cam.far = -centre.z + radius + 50;
    cam.updateProjectionMatrix();
    // The scenes' depth biases were tuned for their own boxes; set it in metres
    // for this one instead: a centimetre along the light, a texel along the
    // surface normal, against acne without lifting shadows off their casters.
    shadow.bias = -0.01 / (cam.far - cam.near);
    shadow.normalBias = texel;
  }
}

// Soft shadow edges: PCF blurs over shadow.radius texels, so set each light's
// radius from its shadow map's texel size to give the same edge in metres.
export function softenShadows(scene: Scene) {
  scene.traverse((o) => {
    const l = o as Light & { shadow?: LightShadow };
    if (!l.isLight || !l.castShadow || !l.shadow) return;
    if (l instanceof DirectionalLight) {
      const cam = l.shadow.camera;
      l.shadow.radius = Math.min(8, Math.max(1, PENUMBRA / ((cam.right - cam.left) / l.shadow.mapSize.x)));
    } else {
      l.shadow.radius = 3;
    }
  });
}
