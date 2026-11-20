import { useLayoutEffect, useMemo, useRef } from "react";
import { CanvasTexture, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3 } from "three";

// Soft dark pools under trees and bushes in place of real shadows, the way
// Slow Roads grounds its foliage: one instanced decal each, laid on the
// ground and tilted to its slope. Where trees crowd together the pools
// overlap and darken, like the shade under a woodlot. Nothing has to be drawn
// into the shadow map.

let blobTexture: CanvasTexture | null = null;
function blob() {
  if (blobTexture) return blobTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(0.5, "rgba(0,0,0,0.75)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return (blobTexture = new CanvasTexture(c));
}

export interface Blob {
  position: Vector3; // on the ground, centred under the crown
  radius: number;
  normal?: Vector3; // the ground's, if it slopes
}

const UP = new Vector3(0, 1, 0);

export function BlobShadows({ blobs, opacity = 0.55 }: { blobs: Blob[]; opacity?: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const { geometry, material } = useMemo(
    () => ({
      geometry: new PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
      material: new MeshBasicMaterial({
        map: blob(),
        color: "#000000",
        opacity,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -6,
      }),
    }),
    [opacity],
  );
  useLayoutEffect(() => {
    const m = mesh.current!;
    const q = new Quaternion();
    const matrix = new Matrix4();
    blobs.forEach((b, i) => {
      q.setFromUnitVectors(UP, b.normal ?? UP);
      // Lifted a little so the decal clears the ground between its vertices.
      matrix.compose(b.position.clone().addScaledVector(b.normal ?? UP, 0.15), q, new Vector3(b.radius, 1, b.radius));
      m.setMatrixAt(i, matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [blobs]);
  if (!blobs.length) return null;
  return <instancedMesh ref={mesh} args={[geometry, material, blobs.length]} renderOrder={1} />;
}
