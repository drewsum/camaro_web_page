import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor, useProgress } from "@react-three/drei";
import { SCENES } from "./scenes";
import { PAGES } from "./pages";
import { enginePlayer } from "./audio/enginePlayer";

const SCENE_KEY = "camaro.scene";
// Phones report 3 or more; past 2 the extra pixels cost far more than they show.
const MAX_DPR = Math.min(window.devicePixelRatio || 1, 2);


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

// The open content page lives in the URL hash (#photos), so pages can be
// linked to and the back button closes them.
function useHashPage() {
  const read = () => PAGES.find((p) => `#${p.id}` === window.location.hash) ?? null;
  const [page, setPage] = useState(read);
  useEffect(() => {
    const sync = () => setPage(read());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return page;
}

function closePage() {
  // Step back if we opened the page ourselves, so back doesn't reopen it.
  if (history.state?.page) history.back();
  else history.pushState(null, "", window.location.pathname + window.location.search);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

function openPage(id: string) {
  const replace = history.state?.page; // switching pages doesn't stack history
  history[replace ? "replaceState" : "pushState"]({ page: id }, "", `#${id}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export default function App() {
  const [sceneId, setSceneId] = useState(savedSceneId);
  const [lightsOn, setLightsOn] = useState(false);
  const [domeOn, setDomeOn] = useState(false);
  const [nightOn, setNightOn] = useState(false);
  const [dpr, setDpr] = useState(MAX_DPR);
  const scene = SCENES.find((s) => s.id === sceneId) ?? SCENES[0];
  const night = !!scene.nightOption && nightOn;
  const lights = scene.night || lightsOn;
  const page = useHashPage();

  // Engine sound is always on, but browsers only let audio start from a user
  // gesture, so it starts on the first click, tap or key press anywhere.
  useEffect(() => {
    // Touch only counts as a gesture on release, hence pointerup/touchend.
    const events = ["pointerdown", "pointerup", "touchend", "keydown"] as const;
    const stop = () => events.forEach((e) => window.removeEventListener(e, start));
    const start = () => {
      // Keep listening until the audio is actually running.
      if (enginePlayer.running) return stop();
      enginePlayer.enable().catch(() => {});
    };
    events.forEach((e) => window.addEventListener(e, start));
    return stop;
  }, []);

  useEffect(() => {
    if (!page) return;
    // A photo lightbox handles its own Escape (and marks it handled).
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && closePage();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page]);

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
      {/* The orbit never comes within 3 m of the car, so the near plane can sit
          well out from the eye; depth precision scales with it, and phone GPUs
          often give WebGL only a 16-bit depth buffer. */}
      <div className={page ? "viewer behind" : "viewer"} inert={!!page}>
        <Canvas shadows dpr={dpr} camera={{ position: [5, 2, 6], fov: 40, near: 0.4 }}>
          {/* Full resolution while the frame rate holds; on a device that
              can't keep up, render fewer pixels (and back up when it can). */}
          <PerformanceMonitor
            factor={1}
            flipflops={4}
            onChange={({ factor }) => setDpr(Math.round((1 + (MAX_DPR - 1) * factor) * 4) / 4)}
            onFallback={() => setDpr(1)}
          />
          <Suspense fallback={null}>
            <scene.Component key={scene.id} lightsOn={lights} domeOn={domeOn} night={night} />
          </Suspense>
        </Canvas>
      </div>
      <Loader />
      <nav className={page ? "site-nav with-page" : "site-nav"} aria-label="Pages">
        {PAGES.map((p) => (
          <a
            key={p.id}
            href={`#${p.id}`}
            aria-current={page?.id === p.id ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              if (page?.id === p.id) closePage();
              else openPage(p.id);
            }}
          >
            {p.label}
          </a>
        ))}
      </nav>
      {page && (
        <div className="page-backdrop" onClick={(e) => e.target === e.currentTarget && closePage()}>
          <article className="page" aria-label={page.label}>
            <button className="page-close" aria-label="Close" onClick={closePage}>
              ×
            </button>
            <page.Component />
          </article>
        </div>
      )}
      <div className="controls" hidden={!!page}>
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
        {scene.nightOption && (
          <label>
            <input
              type="checkbox"
              checked={nightOn}
              onChange={(e) => {
                // Dark out: headlights on (and back off with the daylight).
                setNightOn(e.target.checked);
                setLightsOn(e.target.checked);
              }}
            />
            Night
          </label>
        )}
        <label>
          <input type="checkbox" checked={domeOn} onChange={(e) => setDomeOn(e.target.checked)} />
          Dome light
        </label>
      </div>
      <footer className="attribution" hidden={!!page}>
        Modified from the original model{" "}
        <a href="https://skfb.ly/pNoxx">"1967 Chevrolet Camaro SS 350 Coupe"</a> by Ddiaz Design,
        licensed under{" "}
        <a href="http://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>.
        {scene.credits?.map((c) => (
          <span key={c.title}>
            {" "}
            <a href={c.href}>{c.title}</a>
            {c.author && ` by ${c.author}`} ({c.licenseUrl ? <a href={c.licenseUrl}>{c.license}</a> : c.license}).
          </span>
        ))}
      </footer>
    </>
  );
}
