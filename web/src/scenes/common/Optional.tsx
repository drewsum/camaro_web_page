import { Component, Suspense, type ReactNode } from "react";

// Wraps scenery that's fetched from third-party CDNs at runtime. While it
// loads the rest of the scene runs without it, and if a download fails the
// scene carries on without that piece instead of breaking.
export default function Optional({ children }: { children: ReactNode }) {
  return (
    <SkipOnError>
      <Suspense fallback={null}>{children}</Suspense>
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
