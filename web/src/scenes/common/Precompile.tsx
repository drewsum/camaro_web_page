import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import { DefaultLoadingManager, WebGLRenderTarget, type Group } from "three";

// Compiles its children's shaders before they're drawn, in the background.
//
// three compiles a material's shader the first time it renders it, and waits
// for the result there and then: a car scene's hundred-odd programs froze the
// page for up to ten seconds on a first visit (the browser caches them after
// that), stalling downloads still in flight. compileAsync hands them all to
// the driver at once, which with KHR_parallel_shader_compile builds them on
// its own threads, in parallel, while the page carries on. The children stay
// hidden until every program is ready, and the loading bar counts the wait.
//
// A shader's recipe includes how many lights of each kind are visible and
// whether the scene is drawn into a render target, so both have to match the
// real draw or the programs are only built again then:
// - `offscreen`: the scene goes through the post-processing chain, which does
//   the tone mapping and colour space itself. Nested Precompiles inherit it.
// - A nested Precompile (in Optional) waits for the one around it, whose
//   hidden group would otherwise hide the scene's lights from the compile.
const Outer = createContext({ offscreen: false, ready: true });

export default function Precompile({ children, offscreen }: { children: ReactNode; offscreen?: boolean }) {
  const outer = use(Outer);
  const intoTarget = offscreen ?? outer.offscreen;
  const group = useRef<Group>(null);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const [ready, setReady] = useState(false);
  const endItem = useRef(() => {});

  // Counted on the loading bar from mount, even while waiting for the outer one.
  useEffect(() => {
    const item = `shaders:${group.current?.uuid}`;
    DefaultLoadingManager.itemStart(item);
    let ended = false;
    endItem.current = () => {
      if (!ended) DefaultLoadingManager.itemEnd(item);
      ended = true;
    };
    return () => endItem.current();
  }, []);

  useEffect(() => {
    const g = group.current;
    if (!g || !outer.ready || ready) return;
    let live = true;
    // A frame's grace first, so effects and frame callbacks that set the sky,
    // fog and lights have all run: they're part of every shader's recipe.
    const frame = requestAnimationFrame(() => {
      // compile() reads the lights from visible objects only, and the scene's
      // own lights may be in here. Nothing renders in between.
      g.visible = true;
      const before = gl.getRenderTarget();
      const target = intoTarget ? new WebGLRenderTarget(1, 1) : null;
      let compiling: Promise<unknown>;
      try {
        gl.setRenderTarget(target);
        // The whole scene, not just this group: given a part of a scene,
        // compile() counts the lights in that part twice. Programs already
        // built come straight from the cache.
        compiling = gl.compileAsync(scene, camera);
      } catch (e) {
        compiling = Promise.reject(e);
      } finally {
        gl.setRenderTarget(before);
        target?.dispose();
        g.visible = false;
      }
      compiling
        .catch((e) => console.warn("Precompiling shaders failed; they'll compile as they're drawn:", e))
        .finally(() => {
          if (live) setReady(true);
          endItem.current();
        });
    });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, [outer.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Outer value={{ offscreen: intoTarget, ready }}>
      <group ref={group} visible={ready}>
        {children}
      </group>
    </Outer>
  );
}
