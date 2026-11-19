import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  SpotLight,
  Vector3,
  type ColorRepresentation,
} from "three";
import { polyHavenHdri, useHdriSky, type HdriSky } from "./hdri";

// Night for the outdoor scenes: a moonlit sky in place of the day's, and the
// scene's street lights switched on. Lights are expensive per pixel, so a lamp
// only gets a real light while it's one of the few nearest the car; every lamp
// gets a cheap pool of light painted on the ground under it.

const NIGHT_SKY = polyHavenHdri("kloppenheim_02_puresky"); // clear, with a bright moon
const MOONLIGHT = new Color("#9db2e8");

export function useSceneSky(day: string, sunAzimuth: number | null, exposure: number, night: boolean): HdriSky {
  const sky = useHdriSky(night ? NIGHT_SKY : day, sunAzimuth, exposure);
  return useMemo(() => {
    if (!night) return sky;
    // The moon, clipped out of the sky like the sun, becomes a faint blue key
    // light (with shadows); the sky itself barely lights the car.
    return {
      ...sky,
      sunIntensity: 0.22,
      sunColor: MOONLIGHT,
      envIntensity: 0.22,
      backgroundIntensity: 0.3,
      // The haze far things fade into, dimmed to match the darker sky behind it.
      horizon: sky.horizon.clone().multiplyScalar(0.3),
      fog: sky.fog.clone().multiplyScalar(0.45),
    };
  }, [sky, night]);
}

const origin = new Vector3();
const local = new Vector3();
const inverse = new Matrix4();

// `count` real lights kept at the `spots` nearest the car (which sits at the
// world origin), for spots given in the parent's own space. Spot lights aim
// straight down. Mount it inside whatever group carries the lamps.
export function NearestLights({
  spots,
  count,
  kind = "point",
  color,
  intensity,
  distance,
  angle = 1.1,
}: {
  spots: Vector3[];
  count: number;
  kind?: "point" | "spot";
  color: ColorRepresentation;
  intensity: number;
  distance: number;
  angle?: number;
}) {
  const group = useRef<Group>(null);
  const lights = useMemo(
    () =>
      Array.from({ length: Math.min(count, spots.length) }, () => {
        if (kind === "point") return new PointLight(color, intensity, distance, 2);
        const l = new SpotLight(color, intensity, distance, angle, 0.6, 2);
        l.add(l.target);
        l.target.position.set(0, -1, 0);
        return l;
      }),
    [count, spots.length, kind, color, intensity, distance, angle],
  );
  useFrame(() => {
    const g = group.current;
    if (!g?.parent) return;
    inverse.copy(g.parent.matrixWorld).invert();
    local.copy(origin).applyMatrix4(inverse);
    const nearest = spots
      .map((p, i) => [p.distanceToSquared(local), i] as const)
      .sort((a, b) => a[0] - b[0])
      .slice(0, lights.length);
    nearest.forEach(([, i], k) => lights[k].position.copy(spots[i]));
  });
  return (
    <group ref={group}>
      {lights.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
    </group>
  );
}

// A soft disc of light on the ground under each lamp, added on top of
// whatever's there; it stands in for the real light at every lamp the
// NearestLights pool isn't currently serving.
let glowTexture: CanvasTexture | null = null;
function glow() {
  if (glowTexture) return glowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return (glowTexture = new CanvasTexture(c));
}

export function GroundGlows({ spots, radius, color, opacity = 0.5 }: { spots: Vector3[]; radius: number; color: ColorRepresentation; opacity?: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const { geometry, material } = useMemo(
    () => ({
      geometry: new PlaneGeometry(2 * radius, 2 * radius).rotateX(-Math.PI / 2),
      material: new MeshBasicMaterial({
        map: glow(),
        color: new Color(color).multiplyScalar(opacity),
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -8,
      }),
    }),
    [radius, color, opacity],
  );
  useLayoutEffect(() => {
    const m = mesh.current!;
    const o = new Object3D();
    spots.forEach((p, i) => {
      o.position.copy(p).setY(p.y + 0.03);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [spots]);
  return <instancedMesh ref={mesh} args={[geometry, material, spots.length]} renderOrder={1} />;
}
