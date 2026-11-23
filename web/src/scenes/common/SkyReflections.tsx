import { Environment, EnvironmentPortal } from "@react-three/drei";
import { DoubleSide, type ColorRepresentation } from "three";
import type { HdriSky } from "./hdri";
import SunGlare from "./SunGlare";

// Outdoor lighting for the car from an HDRI sky: the sky as background (unless
// the scene draws its own) and as the environment the paint and chrome reflect.
//
// Poly Haven's "puresky" skies fade into a soft grey-blue below the horizon,
// so on their own the chrome comes out a flat grey with no horizon line along
// the car's flanks. Given a `ground` colour, the sky is rendered into a cube
// map once with a flat ground under it, the way a car in the open sees bright
// sky over dark ground. Skies photographed with their ground leave it out.
export default function SkyReflections({
  sky,
  ground,
  groundY = -0.6,
  background = true,
}: {
  sky: HdriSky;
  ground?: ColorRepresentation; // linear colour of the sunlit ground as seen in reflections
  groundY?: number; // ground height relative to the cube camera (roughly the car's middle)
  background?: boolean;
}) {
  const turn = { environmentRotation: sky.rotation, backgroundRotation: sky.rotation };
  // The sun is clipped out of the sky, so draw it (and its glare) back in by
  // day; a hazy sky's weak sun gets less glare, and the moon none.
  const day = sky.backgroundIntensity === undefined;
  const glare = background && day && <SunGlare sun={sky.sun} color={sky.sunColor} horizon={sky.horizon} strength={sunGlare(sky.sunPeak)} />;
  if (ground === undefined) {
    return (
      <>
        {glare}
        <Environment map={sky.texture} background={background} backgroundIntensity={sky.backgroundIntensity ?? 1} environmentIntensity={sky.envIntensity} {...turn} />
      </>
    );
  }
  return (
    <>
      {glare}
      {/* Both set the scene's environment props on every render, so they must agree. */}
      {background && <Environment map={sky.texture} background="only" backgroundIntensity={sky.backgroundIntensity ?? 1} environmentIntensity={sky.envIntensity} {...turn} />}
      <EnvironmentPortal map={sky.texture} resolution={512} environmentIntensity={sky.envIntensity} {...turn}>
        <mesh rotation-x={-Math.PI / 2} position-y={groundY}>
          <circleGeometry args={[400, 64]} />
          <meshBasicMaterial color={ground} side={DoubleSide} toneMapped={false} />
        </mesh>
      </EnvironmentPortal>
    </>
  );
}

// Glare strength from how far the sun outshines the sky: a hard midday sun
// (~10⁵) gets the full flare, a hazy or setting one (~10–50) under half.
function sunGlare(sunPeak: number) {
  return Math.min(1, Math.max(0, (Math.log10(sunPeak) - 0.5) / 2.5));
}
