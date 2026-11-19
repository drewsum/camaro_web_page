import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, Mesh, MeshDepthMaterial, OrthographicCamera, PlaneGeometry, ShaderMaterial, WebGLRenderTarget, type Group } from "three";
import { HorizontalBlurShader, VerticalBlurShader } from "three-stdlib";
import { CAR_LAYER } from "../car/layers";

// drei's <ContactShadows> (MIT), rendering only the cars. drei's renders the
// whole scene from under the car every frame, and in the city scenes that is
// the ground, curbs, lane paint and nearby trees too: over a million
// triangles a frame for a shadow that only the car casts. Here the camera
// sees only CAR_LAYER (see car/layers.ts), and so does the blur plane it
// renders with. Same props and look as drei's for the ones used here.
interface Props {
  position?: [number, number, number];
  scale?: number;
  opacity?: number;
  blur?: number;
  far?: number;
  resolution?: number;
  color?: string;
}

export default function CarContactShadows({ position, scale = 10, opacity = 1, blur = 1, far = 10, resolution = 512, color = "#000000" }: Props) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const group = useRef<Group>(null);
  const parts = useMemo(() => {
    const target = new WebGLRenderTarget(resolution, resolution);
    const targetBlur = new WebGLRenderTarget(resolution, resolution);
    target.texture.generateMipmaps = targetBlur.texture.generateMipmaps = false;
    const plane = new PlaneGeometry(scale, scale).rotateX(Math.PI / 2);
    const blurPlane = new Mesh(plane);
    blurPlane.layers.set(CAR_LAYER);
    const depth = new MeshDepthMaterial();
    depth.depthTest = depth.depthWrite = false;
    depth.onBeforeCompile = (shader) => {
      shader.uniforms.ucolor = { value: new Color(color) };
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "uniform vec3 ucolor;\nvoid main() {")
        // Colour the shadow; the falloff keeps the centre darker.
        .replace("vec4( vec3( 1.0 - fragCoordZ ), opacity );", "vec4( ucolor * fragCoordZ * 2.0, ( 1.0 - fragCoordZ ) * 1.0 );");
    };
    const hBlur = new ShaderMaterial(HorizontalBlurShader);
    const vBlur = new ShaderMaterial(VerticalBlurShader);
    hBlur.depthTest = vBlur.depthTest = false;
    const camera = new OrthographicCamera(-scale / 2, scale / 2, scale / 2, -scale / 2, 0, far);
    camera.layers.set(CAR_LAYER);
    return { target, targetBlur, plane, blurPlane, depth, hBlur, vBlur, camera };
  }, [resolution, scale, far, color]);

  const blurPass = (amount: number) => {
    const { target, targetBlur, blurPlane, hBlur, vBlur, camera } = parts;
    blurPlane.material = hBlur;
    hBlur.uniforms.tDiffuse.value = target.texture;
    hBlur.uniforms.h.value = amount / 256;
    gl.setRenderTarget(targetBlur);
    gl.render(blurPlane, camera);
    blurPlane.material = vBlur;
    vBlur.uniforms.tDiffuse.value = targetBlur.texture;
    vBlur.uniforms.v.value = amount / 256;
    gl.setRenderTarget(target);
    gl.render(blurPlane, camera);
  };

  useFrame(() => {
    if (!group.current) return;
    const background = scene.background, override = scene.overrideMaterial;
    group.current.visible = false;
    scene.background = null;
    scene.overrideMaterial = parts.depth;
    gl.setRenderTarget(parts.target);
    gl.render(scene, parts.camera);
    blurPass(blur);
    blurPass(blur * 0.4);
    gl.setRenderTarget(null);
    group.current.visible = true;
    scene.overrideMaterial = override;
    scene.background = background;
  });

  return (
    <group ref={group} position={position} rotation-x={Math.PI / 2}>
      <mesh geometry={parts.plane} scale={[1, -1, 1]} rotation-x={-Math.PI / 2}>
        <meshBasicMaterial transparent map={parts.target.texture} opacity={opacity} depthWrite={false} />
      </mesh>
      <primitive object={parts.camera} />
    </group>
  );
}
