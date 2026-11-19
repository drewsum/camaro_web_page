import { Environment, EnvironmentPortal } from "@react-three/drei";
import { DoubleSide, type ColorRepresentation } from "three";
import type { HdriSky } from "./hdri";

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
  if (ground === undefined) {
    return <Environment map={sky.texture} background={background} backgroundIntensity={sky.backgroundIntensity ?? 1} environmentIntensity={sky.envIntensity} {...turn} />;
  }
  return (
    <>
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
