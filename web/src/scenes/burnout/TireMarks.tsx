import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, LinearMipmapLinearFilter, MeshStandardMaterial, SRGBColorSpace } from "three";

// Rubber laid down on the asphalt: each frame a short dark stroke is drawn
// along every sliding tyre's path into a canvas spread over the pen, so the
// circles and figure eights build up into a thick black tangle. Old rubber
// very slowly weathers away, so the pen never goes solid black.

export interface Tyre {
  x: number;
  z: number;
  strength: number; // 0 = rolling, 1 = spinning flat out
}

const PX = 2048;
const UPLOAD_EVERY = 3; // frames between texture uploads (a 2k canvas is 16 MB)

export default function TireMarks({ tyres, half }: { tyres: { current: Tyre[] }; half: number }) {
  const state = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = PX;
    const g = canvas.getContext("2d")!;
    g.lineCap = "round";
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    texture.minFilter = LinearMipmapLinearFilter;
    const material = new MeshStandardMaterial({
      map: texture,
      color: "#ffffff",
      transparent: true,
      roughness: 0.55, // rubber polishes the surface a little
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    return { g, texture, material, last: [] as ({ x: number; z: number } | null)[], frame: 0, fade: 0 };
  }, []);

  useFrame((_, delta) => {
    const s = state;
    const k = PX / (2 * half); // pixels per metre
    const toPx = (x: number, z: number) => [(x + half) * k, (z + half) * k] as const;
    tyres.current.forEach((t, i) => {
      const prev = s.last[i];
      s.last[i] = { x: t.x, z: t.z };
      // Nothing across a long gap (a hidden tab, a hitch): that would be a chord.
      if (!prev || t.strength < 0.05 || Math.hypot(t.x - prev.x, t.z - prev.z) > 1) return;
      const [x0, y0] = toPx(prev.x, prev.z);
      const [x1, y1] = toPx(t.x, t.z);
      s.g.strokeStyle = `rgba(12, 11, 10, ${0.16 * t.strength})`;
      s.g.lineWidth = 0.24 * k;
      s.g.beginPath();
      s.g.moveTo(x0, y0);
      s.g.lineTo(x1, y1);
      s.g.stroke();
    });
    // Weathering: a whisper of every mark rubbed out every couple of seconds.
    s.fade += delta;
    if (s.fade > 2) {
      s.fade = 0;
      s.g.globalCompositeOperation = "destination-out";
      s.g.fillStyle = "rgba(0,0,0,0.012)";
      s.g.fillRect(0, 0, PX, PX);
      s.g.globalCompositeOperation = "source-over";
    }
    if (++s.frame % UPLOAD_EVERY === 0) s.texture.needsUpdate = true;
  });

  // The canvas's y runs down its rows, which is +z on the ground after the
  // plane is laid flat (rotation -90° about x maps the plane's -y to +z).
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.006} material={state.material} receiveShadow renderOrder={1}>
      <planeGeometry args={[2 * half, 2 * half]} />
    </mesh>
  );
}
