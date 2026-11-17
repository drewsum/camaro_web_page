import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import ShowroomScene from "./scenes/ShowroomScene";

function Loader() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return <div className="loader">Loading {progress.toFixed(0)}%</div>;
}

export default function App() {
  const [lightsOn, setLightsOn] = useState(false);
  return (
    <>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [5, 2, 6], fov: 40 }}>
        <Suspense fallback={null}>
          <ShowroomScene lightsOn={lightsOn} />
        </Suspense>
      </Canvas>
      <Loader />
      <div className="controls">
        <label>
          <input type="checkbox" checked={lightsOn} onChange={(e) => setLightsOn(e.target.checked)} />
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
