import { Component, Suspense, type ReactNode } from "react";
import Precompile from "./Precompile";

// Wraps scenery that loads on its own (extra models, plants). While it
// loads the rest of the scene runs without it, and if a download fails the
// scene carries on without that piece instead of breaking. It appears once
// its shaders are built (see Precompile), rather than freezing the scene.
export default function Optional({ children }: { children: ReactNode }) {
  return (
    <SkipOnError>
      <Suspense fallback={null}>
        <Precompile>{children}</Precompile>
      </Suspense>
    </SkipOnError>
  );
}

class SkipOnError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("Optional scenery failed to load and was skipped:", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
