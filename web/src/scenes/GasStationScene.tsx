import { useLayoutEffect, useMemo } from "react";
import { OrbitControls } from "@react-three/drei";
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace, Vector3 } from "three";
import CarContactShadows from "../components/CarContactShadows";
import CamaroModel from "../components/CamaroModel";
import MustangModel from "../components/MustangModel";
import type { SceneProps } from ".";
import { useCameraStart } from "./useCameraStart";
import { useExposure, useFarPlane } from "./common/renderer";
import { polyHavenHdri } from "./common/hdri";
import { NearestLights, useSceneSky } from "./common/night";
import SkyReflections from "./common/SkyReflections";
import GrassField from "./common/GrassField";
import Optional from "./common/Optional";
import Countryside, { type CountrysideProps } from "./common/Countryside";
import { preloadPbr, usePbrMaterial } from "./common/pbr";

// A 1950s roadside filling station on a two-lane highway: the Camaro pulled
// up at the pumps under a lit canopy, a two-bay service garage with its
// office, a tall pole sign with the day's prices, and a railcar diner next
// door with a Mustang outside. Farmland all around. Every name on the signs
// is made up.

const SKY = polyHavenHdri("kloofendal_48d_partly_cloudy_puresky");
const EXPOSURE = 0.85;
const FIELD = 8000;
const HAZE = "#9ea3b6";

const ASPHALT = "asphalt_04";
const CONCRETE = "brushed_concrete_03";
preloadPbr(ASPHALT);
preloadPbr(CONCRETE);

const ROAD_X = 17; // highway centreline, running along z

const COUNTRYSIDE: CountrysideProps = {
  seed: 23,
  centre: [0, 10],
  hills: { from: 260, to: 1400, height: 50 },
  trees: { from: 70, to: 650, woodlots: 9, hedgerows: 10, singles: 30 },
  clear: (x, z) => Math.abs(x - ROAD_X) < 14 || (x > -45 && x < 32 && z > -60 && z < 50),
  farm: { x: -240, z: 160, rotation: 0.7 },
  powerLine: { from: [ROAD_X + 11, -900], to: [ROAD_X + 11, 900] },
  bales: { x: 180, z: -160, spread: 160, count: 26 },
};

// ---- Painted signs ---------------------------------------------------------------

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const text = (g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, font = "'Arial Black', Impact, sans-serif", glow?: string) => {
  g.font = `bold ${size}px ${font}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (glow) {
    g.shadowColor = glow;
    g.shadowBlur = size * 0.35;
  }
  g.fillStyle = color;
  g.fillText(s, x, y);
  g.shadowBlur = 0;
};

// The brand: a red disc with a gold crown and the name across it. With `lit`
// the same artwork on black, for the emissive map.
const brandSign = (lit: boolean) =>
  canvasTexture(512, 512, (g) => {
    g.fillStyle = lit ? "#000" : "#f3efe6";
    g.fillRect(0, 0, 512, 512);
    g.fillStyle = lit ? "#7a0a0a" : "#c8242b";
    g.beginPath();
    g.arc(256, 256, 240, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 16;
    g.strokeStyle = lit ? "#000" : "#f3efe6";
    g.beginPath();
    g.arc(256, 256, 222, 0, Math.PI * 2);
    g.stroke();
    // Crown.
    g.fillStyle = lit ? "#ffd75a" : "#f2c230";
    g.beginPath();
    g.moveTo(166, 190);
    g.lineTo(186, 120);
    g.lineTo(221, 165);
    g.lineTo(256, 105);
    g.lineTo(291, 165);
    g.lineTo(326, 120);
    g.lineTo(346, 190);
    g.closePath();
    g.fill();
    text(g, "ROADKING", 256, 278, 78, lit ? "#ffffff" : "#ffffff");
    text(g, "GASOLINE", 256, 360, 46, lit ? "#ffd75a" : "#f2c230");
  });

const priceBoard = (lit: boolean) =>
  canvasTexture(512, 256, (g) => {
    g.fillStyle = lit ? "#000" : "#f3efe6";
    g.fillRect(0, 0, 512, 256);
    if (!lit) {
      g.strokeStyle = "#1d3f8f";
      g.lineWidth = 10;
      g.strokeRect(5, 5, 502, 246);
    }
    text(g, "REGULAR", 150, 70, 46, lit ? "#9ad0ff" : "#1d3f8f");
    text(g, "29.9¢", 390, 70, 64, lit ? "#ffffff" : "#c8242b");
    text(g, "ETHYL", 150, 180, 46, lit ? "#9ad0ff" : "#1d3f8f");
    text(g, "33.9¢", 390, 180, 64, lit ? "#ffffff" : "#c8242b");
  });

const fasciaBoard = (label: string, bg: string, fg: string) =>
  canvasTexture(1024, 128, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 1024, 128);
    text(g, label, 512, 68, 76, fg);
  });

const neonBoard = (label: string, color: string, glow: string, lit: boolean, w = 1024, h = 256) =>
  canvasTexture(w, h, (g) => {
    g.fillStyle = lit ? "#000" : "#2a2a2a";
    g.fillRect(0, 0, w, h);
    text(g, label, w / 2, h / 2 + 8, h * 0.62, lit ? color : "#d9d4c7", "'Brush Script MT', 'Segoe Script', cursive", lit ? glow : undefined);
  });

const pumpFace = () =>
  canvasTexture(256, 384, (g) => {
    g.fillStyle = "#c8242b";
    g.fillRect(0, 0, 256, 384);
    g.fillStyle = "#f4f1e8";
    g.beginPath();
    g.arc(128, 120, 92, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#1a1a1a";
    g.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(128 + Math.cos(a) * 70, 120 + Math.sin(a) * 70);
      g.lineTo(128 + Math.cos(a) * 84, 120 + Math.sin(a) * 84);
      g.stroke();
    }
    g.fillStyle = "#1a1a1a";
    g.fillRect(70, 96, 116, 24);
    g.fillStyle = "#f2c230";
    g.font = "bold 18px monospace";
    g.textAlign = "center";
    g.fillText("0 2 4 . 7", 128, 114);
    text(g, "ROADKING", 128, 262, 34, "#ffffff");
    g.fillStyle = "#f2c230";
    g.fillRect(28, 300, 200, 6);
  });

const sodaCooler = () =>
  canvasTexture(256, 128, (g) => {
    g.fillStyle = "#c8242b";
    g.fillRect(0, 0, 256, 128);
    text(g, "ICE COLD", 128, 44, 34, "#ffffff");
    text(g, "SODA", 128, 92, 46, "#ffffff", "'Brush Script MT', 'Segoe Script', cursive");
  });

// ---- Materials ---------------------------------------------------------------------

function useParts(night: boolean) {
  const parts = useMemo(() => {
    const m = (color: string, roughness = 0.7, metalness = 0) => new MeshStandardMaterial({ color, roughness, metalness });
    const lit = (map: CanvasTexture, emissive: CanvasTexture) => new MeshStandardMaterial({ map, emissiveMap: emissive, emissive: "#ffffff", emissiveIntensity: 0, roughness: 0.5 });
    return {
      white: m("#f1ede3"),
      red: m("#c8242b", 0.5),
      blue: m("#1d3f8f", 0.5),
      chrome: m("#d8dadc", 0.18, 1),
      steel: m("#9a9d9f", 0.45, 0.6),
      dark: m("#1d1f21", 0.6),
      rubber: m("#151515", 0.9),
      concrete: m("#bdb8ad", 0.9),
      glass: new MeshStandardMaterial({ color: "#2c3a44", roughness: 0.08, metalness: 0.3, emissive: "#ffd99a", emissiveIntensity: 0 }),
      canopyLight: new MeshStandardMaterial({ color: "#f5f3ea", emissive: "#fff3d6", emissiveIntensity: 0, roughness: 0.4 }),
      globe: new MeshStandardMaterial({ color: "#f4f1e8", emissive: "#fff1cf", emissiveIntensity: 0.05, roughness: 0.3 }),
      brand: lit(brandSign(false), brandSign(true)),
      prices: lit(priceBoard(false), priceBoard(true)),
      diner: lit(neonBoard("Rosie's Diner", "#ff5f8f", "#ff2a6d", false), neonBoard("Rosie's Diner", "#ff5f8f", "#ff2a6d", true)),
      eat: lit(neonBoard("EAT", "#7af6ff", "#38f2ff", false, 512, 256), neonBoard("EAT", "#7af6ff", "#38f2ff", true, 512, 256)),
      service: new MeshStandardMaterial({ map: fasciaBoard("ROADKING  •  SERVICE", "#c8242b", "#ffffff"), roughness: 0.6 }),
      pump: new MeshStandardMaterial({ map: pumpFace(), roughness: 0.45 }),
      soda: new MeshStandardMaterial({ map: sodaCooler(), roughness: 0.45 }),
      dinerSkin: m("#c9ccce", 0.25, 0.85),
      dinerStripe: m("#1d3f8f", 0.4, 0.3),
    };
  }, []);
  useLayoutEffect(() => {
    for (const k of ["brand", "prices", "diner", "eat"] as const) parts[k].emissiveIntensity = night ? 2.2 : 0;
    parts.glass.emissiveIntensity = night ? 0.7 : 0;
    parts.canopyLight.emissiveIntensity = night ? 3 : 0;
    parts.globe.emissiveIntensity = night ? 2.5 : 0.05;
  }, [night, parts]);
  return parts;
}
type Parts = ReturnType<typeof useParts>;

// ---- Ground ------------------------------------------------------------------------

function Ground() {
  const apron = usePbrMaterial(CONCRETE, { tile: 2, size: [80, 120], tint: "#cfd8e0", brightness: 1.55, roughness: 1.1 }); // cooled: the scan is brownish
  const road = usePbrMaterial(ASPHALT, { tile: 4, size: [8, 1600], normalScale: 0.8, brightness: 0.8 });
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[-6, 0.012, -8]} material={apron} receiveShadow>
        <planeGeometry args={[80, 120]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[ROAD_X, 0.02, 0]} material={road} receiveShadow>
        <planeGeometry args={[8, 1600]} />
      </mesh>
      {[-0.1, 0.1].map((dx) => (
        <mesh key={dx} rotation-x={-Math.PI / 2} position={[ROAD_X + dx, 0.025, 0]}>
          <planeGeometry args={[0.1, 1600]} />
          <meshStandardMaterial color="#e2ac26" roughness={0.6} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      ))}
      {[-3.8, 3.8].map((dx) => (
        <mesh key={dx} rotation-x={-Math.PI / 2} position={[ROAD_X + dx, 0.025, 0]}>
          <planeGeometry args={[0.1, 1600]} />
          <meshStandardMaterial color="#eeece4" roughness={0.6} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      ))}
    </>
  );
}

// ---- The forecourt --------------------------------------------------------------------

function Pump({ p, z }: { p: Parts; z: number }) {
  return (
    <group position={[0, 0.25, z]}>
      <mesh position={[0, 0.85, 0]} material={p.red} castShadow>
        <boxGeometry args={[0.55, 1.7, 0.42]} />
      </mesh>
      {/* Dial face on the side toward the car (+x). */}
      <mesh position={[0.276, 1.05, 0]} rotation-y={Math.PI / 2} material={p.pump}>
        <planeGeometry args={[0.4, 0.6]} />
      </mesh>
      <mesh position={[0, 1.72, 0]} material={p.chrome}>
        <boxGeometry args={[0.6, 0.06, 0.46]} />
      </mesh>
      {/* The lit globe on top. */}
      <mesh position={[0, 1.98, 0]} material={p.globe} castShadow>
        <sphereGeometry args={[0.24, 20, 14]} />
      </mesh>
      {/* Nozzle in its holster, and the hose looping down. */}
      <mesh position={[0.3, 0.95, 0.12]} rotation-z={0.3} material={p.dark}>
        <boxGeometry args={[0.08, 0.22, 0.06]} />
      </mesh>
      <mesh position={[0.34, 0.55, 0.12]} material={p.rubber}>
        <torusGeometry args={[0.32, 0.025, 6, 20, Math.PI]} />
      </mesh>
    </group>
  );
}

function Forecourt({ p }: { p: Parts }) {
  return (
    <group position={[-2.1, 0, 0]}>
      {/* The pump island. */}
      <mesh position={[0, 0.125, 1]} material={p.concrete} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.25, 7.5]} />
      </mesh>
      <mesh position={[0, 0.25, 1]} material={p.red}>
        <boxGeometry args={[1.22, 0.02, 7.52]} />
      </mesh>
      <Pump p={p} z={-1} />
      <Pump p={p} z={1.6} />
      <Pump p={p} z={4.2} />
      {/* The canopy over it, lit from beneath at night. */}
      {[-2, 4].map((z) => (
        <mesh key={z} position={[0, 2.2, z]} material={p.white} castShadow>
          <boxGeometry args={[0.25, 4.4, 0.25]} />
        </mesh>
      ))}
      <mesh position={[0, 4.55, 1]} material={p.white} castShadow>
        <boxGeometry args={[6, 0.3, 9.5]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 3.01, 4.55, 1]} rotation-y={(s * Math.PI) / 2} material={p.red}>
          <planeGeometry args={[9.5, 0.3]} />
        </mesh>
      ))}
      {[-2.6, 1, 4.6].map((z) =>
        [-1.6, 1.6].map((x) => (
          <mesh key={`${x}${z}`} position={[x, 4.39, z]} rotation-x={Math.PI / 2} material={p.canopyLight}>
            <planeGeometry args={[0.9, 0.5]} />
          </mesh>
        )),
      )}
      {/* A water barrel and squeegee, and the air pump. */}
      <mesh position={[0, 0.65, -3.2]} material={p.blue} castShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.8, 16]} />
      </mesh>
      <group position={[0.2, 0, 6.5]}>
        <mesh position={[0, 0.7, 0]} material={p.red} castShadow>
          <cylinderGeometry args={[0.1, 0.12, 1.4, 10]} />
        </mesh>
        <mesh position={[0, 1.45, 0]} material={p.white}>
          <boxGeometry args={[0.3, 0.3, 0.12]} />
        </mesh>
      </group>
    </group>
  );
}

// ---- The garage ------------------------------------------------------------------------

function Garage({ p }: { p: Parts }) {
  // Faces +x (toward the pumps and the road), standing back from the island.
  return (
    <group position={[-15, 0, -2]}>
      {/* Office: big plate windows. */}
      <mesh position={[0, 2, 7]} material={p.white} castShadow receiveShadow>
        <boxGeometry args={[7, 4, 8]} />
      </mesh>
      <mesh position={[3.51, 1.7, 7.5]} rotation-y={Math.PI / 2} material={p.glass}>
        <planeGeometry args={[6, 2.2]} />
      </mesh>
      <mesh position={[3.52, 1.1, 4.1]} rotation-y={Math.PI / 2} material={p.blue}>
        <planeGeometry args={[1, 2.2]} />
      </mesh>
      {/* Two service bays, one door up with a lift inside, one down. */}
      <mesh position={[0, 2.4, -2.5]} material={p.white} castShadow receiveShadow>
        <boxGeometry args={[7, 4.8, 11]} />
      </mesh>
      <mesh position={[3.51, 1.7, -0.5]} rotation-y={Math.PI / 2} material={p.dark}>
        <planeGeometry args={[4, 3.4]} />
      </mesh>
      <mesh position={[3.52, 1.7, -5.5]} rotation-y={Math.PI / 2} material={p.glass}>
        <planeGeometry args={[4, 3.4]} />
      </mesh>
      {[-1.4, 1.4].map((dz) => (
        <mesh key={dz} position={[1.6, 1, -0.5 + dz]} material={p.steel}>
          <cylinderGeometry args={[0.13, 0.13, 2, 10]} />
        </mesh>
      ))}
      <mesh position={[1.6, 1.9, -0.5]} material={p.red}>
        <boxGeometry args={[2, 0.12, 3]} />
      </mesh>
      {/* The fascia band across the front. */}
      <mesh position={[3.56, 4.25, -2.5]} rotation-y={Math.PI / 2} material={p.service}>
        <planeGeometry args={[11, 1.1]} />
      </mesh>
      <mesh position={[3.54, 3.65, 7]} rotation-y={Math.PI / 2} material={p.red}>
        <planeGeometry args={[8, 0.2]} />
      </mesh>
      {/* Out front: a tyre stack, an oil can rack and the soda cooler. */}
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} position={[4.6, 0.12 + k * 0.24, -8.3]} rotation-x={Math.PI / 2} material={p.rubber} castShadow>
          <torusGeometry args={[0.32, 0.12, 8, 18]} />
        </mesh>
      ))}
      <group position={[4.3, 0, 3]}>
        <mesh position={[0, 0.6, 0]} material={p.steel}>
          <boxGeometry args={[0.4, 1.2, 1.2]} />
        </mesh>
        {[0.35, 0.75, 1.1].map((y) =>
          [-0.4, 0, 0.4].map((z) => (
            <mesh key={`${y}${z}`} position={[0.12, y, z]} material={z === 0 ? p.blue : p.red}>
              <cylinderGeometry args={[0.07, 0.07, 0.17, 10]} />
            </mesh>
          )),
        )}
      </group>
      <group position={[4.2, 0, 10.2]}>
        <mesh position={[0, 0.5, 0]} material={p.red} castShadow>
          <boxGeometry args={[0.7, 1, 1.3]} />
        </mesh>
        <mesh position={[0.36, 0.62, 0]} rotation-y={Math.PI / 2} material={p.soda}>
          <planeGeometry args={[1.2, 0.6]} />
        </mesh>
      </group>
    </group>
  );
}

// ---- The pole sign ------------------------------------------------------------------

function PoleSign({ p }: { p: Parts }) {
  return (
    <group position={[11, 0, -12]}>
      <mesh position={[0, 4.5, 0]} material={p.steel} castShadow>
        <cylinderGeometry args={[0.16, 0.2, 9, 10]} />
      </mesh>
      {/* The brand disc, readable both ways along the highway. */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * 0.09, 8.6, 0]} rotation-y={(s * Math.PI) / 2} material={p.brand}>
          <circleGeometry args={[1.5, 40]} />
        </mesh>
      ))}
      <mesh position={[0, 8.6, 0]} rotation-z={Math.PI / 2} material={p.red}>
        <cylinderGeometry args={[1.52, 1.52, 0.16, 40]} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * 0.09, 6.4, 0]} rotation-y={(s * Math.PI) / 2} material={p.prices}>
          <planeGeometry args={[2.4, 1.2]} />
        </mesh>
      ))}
      <mesh position={[0, 6.4, 0]} material={p.white}>
        <boxGeometry args={[0.16, 1.24, 2.44]} />
      </mesh>
    </group>
  );
}

// ---- The diner -----------------------------------------------------------------------

function Diner({ p }: { p: Parts }) {
  // A long stainless railcar diner, its long side to the lot.
  return (
    <group position={[-13, 0, -30]}>
      <mesh position={[0, 0.5, 0]} material={p.concrete}>
        <boxGeometry args={[6.4, 1, 17]} />
      </mesh>
      <mesh position={[0, 2.4, 0]} material={p.dinerSkin} castShadow receiveShadow>
        <boxGeometry args={[6, 2.8, 16]} />
      </mesh>
      {/* The barrel roof. */}
      <mesh position={[0, 3.8, 0]} rotation-x={Math.PI / 2} material={p.dinerSkin} castShadow>
        <cylinderGeometry args={[3.05, 3.05, 16.1, 28, 1, false, -Math.PI / 2, Math.PI]} />
      </mesh>
      {[1.4, 3.1].map((y) => (
        <mesh key={y} position={[3.01, y, 0]} rotation-y={Math.PI / 2} material={p.dinerStripe}>
          <planeGeometry args={[16, 0.16]} />
        </mesh>
      ))}
      {Array.from({ length: 9 }, (_, i) => -6.8 + i * 1.7).map((z) => (
        <mesh key={z} position={[3.02, 2.3, z]} rotation-y={Math.PI / 2} material={p.glass}>
          <planeGeometry args={[1.4, 1.1]} />
        </mesh>
      ))}
      {/* Neon on the roof and over the door. */}
      <mesh position={[3.4, 6.2, 0]} rotation-y={Math.PI / 2} material={p.diner}>
        <planeGeometry args={[9, 2.2]} />
      </mesh>
      <mesh position={[3.35, 6.2, 0]} rotation-y={Math.PI / 2} material={p.dark}>
        <planeGeometry args={[9.2, 2.4]} />
      </mesh>
      <mesh position={[3.6, 3.6, -9]} rotation-y={Math.PI / 2} material={p.eat}>
        <planeGeometry args={[2.4, 1.2]} />
      </mesh>
      {/* Steps up to the door. */}
      <mesh position={[3.6, 0.25, -6]} material={p.concrete}>
        <boxGeometry args={[1.2, 0.5, 2]} />
      </mesh>
    </group>
  );
}

// ---- Night lighting -----------------------------------------------------------------------

const LAMPS = [
  // Under the canopy, at the pole sign, and outside the diner and garage.
  new Vector3(-2.1, 4.2, -1.5),
  new Vector3(-2.1, 4.2, 3.5),
  new Vector3(11, 7, -12),
  new Vector3(-9, 3.5, -34),
  new Vector3(-11, 3.8, -2),
];

// ---- Scene ------------------------------------------------------------------------------

function Station({ lightsOn, domeOn, night = false }: SceneProps) {
  const sky = useSceneSky(SKY, 2.2, EXPOSURE, night);
  const sun = useMemo(() => sky.sun.clone().multiplyScalar(60), [sky]);
  const parts = useParts(night);
  return (
    <>
      <fogExp2 attach="fog" args={[night ? sky.fog : HAZE, 0.0018]} />
      <SkyReflections sky={sky} ground="#3a3a34" />
      <GrassField size={FIELD} mown={false} behind />
      <Countryside config={COUNTRYSIDE} />
      <directionalLight
        position={sun}
        intensity={sky.sunIntensity}
        color={sky.sunColor}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0003}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-far={160}
      />
      <Ground />
      <Forecourt p={parts} />
      <Garage p={parts} />
      <PoleSign p={parts} />
      <Diner p={parts} />
      {night && <NearestLights spots={LAMPS} count={5} color="#ffe2b0" intensity={45} distance={22} />}

      {/* Hood propped up while the attendant checks the oil. */}
      <CamaroModel lightsOn={lightsOn} domeOn={domeOn} hoodOpen={0.95} />
      <Optional>
        <group position={[-4.8, 0, -28]} rotation-y={-Math.PI / 2 - 0.15}>
          <MustangModel />
        </group>
      </Optional>
      <CarContactShadows position={[0, 0.02, 0]} opacity={0.5} scale={12} blur={2} far={2} />
    </>
  );
}

export default function GasStationScene(props: SceneProps) {
  useCameraStart(11, 3.6, 13);
  useFarPlane(5000);
  useExposure(EXPOSURE);
  return (
    <>
      <Station {...props} />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={3} maxDistance={20} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}
