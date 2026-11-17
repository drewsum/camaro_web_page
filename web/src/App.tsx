import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import { SCENES } from "./scenes";

const SCENE_KEY = "camaro.scene";

function Loader() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return <div className="loader">Loading {progress.toFixed(0)}%</div>;
}

function savedSceneId() {
  try {
    const id = localStorage.getItem(SCENE_KEY);
    if (SCENES.some((s) => s.id === id)) return id!;
  } catch {
    // storage unavailable (private window, blocked site data)
  }
  return SCENES[0].id;
}

export default function App() {
  const [sceneId, setSceneId] = useState(savedSceneId);
  const [lightsOn, setLightsOn] = useState(false);
  const scene = SCENES.find((s) => s.id === sceneId) ?? SCENES[0];
  const lights = scene.night || lightsOn;

  const chooseScene = (id: string) => {
    setSceneId(id);
    try {
      localStorage.setItem(SCENE_KEY, id);
    } catch {
      // not remembered, which is fine
    }
  };

  return (
    <>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [5, 2, 6], fov: 40 }}>
        <Suspense fallback={null}>
          <scene.Component key={scene.id} lightsOn={lights} />
        </Suspense>
      </Canvas>
      <Loader />
      <div className="controls">
        <select aria-label="Environment" value={scene.id} onChange={(e) => chooseScene(e.target.value)}>
          {SCENES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <label title={scene.night ? "Always on at night" : undefined}>
          <input
            type="checkbox"
            checked={lights}
            disabled={scene.night}
            onChange={(e) => setLightsOn(e.target.checked)}
          />
          Lights
        </label>
      </div>
      <footer className="attribution">
        Modified from the original model{" "}
        <a href="https://skfb.ly/pNoxx">"1967 Chevrolet Camaro SS 350 Coupe"</a> by Ddiaz Design,
        licensed under{" "}
        <a href="http://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>.
      </footer>
    </>
  );
}
