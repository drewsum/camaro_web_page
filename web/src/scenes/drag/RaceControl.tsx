import { useMemo } from "react";
import { CanvasTexture, Color, MeshStandardMaterial, SRGBColorSpace } from "three";

// The race control tower beside the starting line: a block-built ground
// floor with a door and an outside stair up to a glass-walled booth where
// the starter and timing officials sit, under a flat roof with a sign
// facing the lanes. Built facing -x (toward the track); its interior is lit
// after dark.

function signTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#14161a";
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = "#c8202a";
  g.fillRect(0, 0, 1024, 14);
  g.fillRect(0, 114, 1024, 14);
  g.fillStyle = "#f2f0ea";
  g.font = "bold 76px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("RACE CONTROL", 512, 68);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const W = 5; // across (x)
const L = 8; // along the track (z)
const BASE_H = 3.2;
const BOOTH_H = 2.7;

export default function RaceControl({ position, night = false }: { position: [number, number, number]; night?: boolean }) {
  const m = useMemo(() => {
    const std = (color: string, roughness = 0.85, metalness = 0) => new MeshStandardMaterial({ color, roughness, metalness });
    const sign = signTexture();
    return {
      block: std("#c9c6bd", 0.9),
      trim: std("#2b2d30", 0.6, 0.3),
      roof: std("#8d8f91", 0.8),
      rail: std("#d8dadc", 0.4, 0.7),
      door: std("#3c4a5a", 0.6),
      glass: new MeshStandardMaterial({ color: "#1b252d", roughness: 0.08, metalness: 0.7, emissive: new Color("#ffd9a0") }),
      sign: new MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: new Color("#ffffff"), roughness: 0.6 }),
    };
  }, []);
  m.glass.emissiveIntensity = night ? 0.3 : 0;
  m.sign.emissiveIntensity = night ? 0.8 : 0;
  const boothY = BASE_H + BOOTH_H / 2;
  const mullionsZ = Array.from({ length: 5 }, (_, i) => -L / 2 + 0.1 + (i * (L - 0.2)) / 4);
  const steps = 14;
  return (
    <group position={position}>
      {/* Ground floor */}
      <mesh position-y={BASE_H / 2} material={m.block} castShadow receiveShadow>
        <boxGeometry args={[W, BASE_H, L]} />
      </mesh>
      <mesh position={[-W / 2 - 0.01, 1.05, -L / 4]} material={m.door}>
        <boxGeometry args={[0.04, 2.1, 0.95]} />
      </mesh>
      {/* Floor slab of the booth, with a lip */}
      <mesh position-y={BASE_H + 0.08} material={m.trim} castShadow>
        <boxGeometry args={[W + 0.5, 0.16, L + 0.5]} />
      </mesh>
      {/* The glass booth and its frame */}
      <mesh position-y={boothY + 0.08} material={m.glass}>
        <boxGeometry args={[W - 0.1, BOOTH_H, L - 0.1]} />
      </mesh>
      {mullionsZ.map((z) =>
        [-1, 1].map((s) => (
          <mesh key={`${z}${s}`} position={[(s * (W - 0.1)) / 2, boothY + 0.08, z]} material={m.trim}>
            <boxGeometry args={[0.08, BOOTH_H, 0.1]} />
          </mesh>
        )),
      )}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, boothY + 0.08, (s * (L - 0.1)) / 2]} material={m.trim}>
          <boxGeometry args={[W - 0.1, BOOTH_H, 0.08]} />
        </mesh>
      ))}
      {/* Window sill band, and the roof with its overhang and sign */}
      <mesh position-y={BASE_H + 0.75} material={m.trim}>
        <boxGeometry args={[W + 0.02, 0.06, L + 0.02]} />
      </mesh>
      <mesh position-y={BASE_H + BOOTH_H + 0.3} material={m.roof} castShadow>
        <boxGeometry args={[W + 1.4, 0.28, L + 1]} />
      </mesh>
      <mesh position={[-(W + 1.4) / 2 - 0.02, BASE_H + BOOTH_H + 0.75, 0]} rotation-y={-Math.PI / 2} material={m.sign}>
        <planeGeometry args={[L - 0.4, 0.8]} />
      </mesh>
      <mesh position={[-(W + 1.4) / 2 + 0.05, BASE_H + BOOTH_H + 0.75, 0]} material={m.trim}>
        <boxGeometry args={[0.08, 0.9, L - 0.2]} />
      </mesh>
      {/* Rooftop air conditioner and a radio mast */}
      <mesh position={[0.8, BASE_H + BOOTH_H + 0.75, 1.8]} material={m.rail} castShadow>
        <boxGeometry args={[1.2, 0.7, 1.4]} />
      </mesh>
      <mesh position={[1.4, BASE_H + BOOTH_H + 2.3, -2.6]} material={m.trim}>
        <cylinderGeometry args={[0.03, 0.04, 4, 6]} />
      </mesh>
      {/* Outside stair up the back corner to the booth door, with a rail */}
      {Array.from({ length: steps }, (_, i) => (
        <mesh key={i} position={[W / 2 + 0.55, ((i + 0.5) * BASE_H) / steps, L / 2 - 0.4 - i * 0.26]} material={m.roof} castShadow>
          <boxGeometry args={[1, 0.06, 0.28]} />
        </mesh>
      ))}
      <mesh
        position={[W / 2 + 1.05, BASE_H / 2 + 0.9, L / 2 - 0.4 - ((steps - 1) * 0.26) / 2]}
        rotation-x={Math.atan2(BASE_H, steps * 0.26)}
        material={m.rail}
      >
        <boxGeometry args={[0.04, 0.04, Math.hypot(BASE_H, steps * 0.26) + 0.2]} />
      </mesh>
      <mesh position={[W / 2 + 0.55, BASE_H - 0.03, L / 2 - 0.4 - steps * 0.26 - 0.5]} material={m.roof}>
        <boxGeometry args={[1, 0.08, 1]} />
      </mesh>
    </group>
  );
}
