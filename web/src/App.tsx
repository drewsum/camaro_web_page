import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import ShowroomScene from "./scenes/ShowroomScene";

function Loader() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return <div className="loader">Loading {progress.toFixed(0)}%</div>;
}

export default function App() {
  return (
    <>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [5, 2, 6], fov: 40 }}>
        <Suspense fallback={null}>
          <ShowroomScene />
        </Suspense>
      </Canvas>
      <Loader />
      <footer className="attribution">
        <a href="https://skfb.ly/pNoxx">"1967 Chevrolet Camaro SS 350 Coupe"</a> by Ddiaz Design,
        licensed under{" "}
        <a href="http://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>. Modified.
      </footer>
    </>
  );
}
