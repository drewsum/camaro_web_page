import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from "three";
import { DITHER_GLSL } from "./dither";

// Distant trees as impostors: each kind of tree is photographed once, from
// VIEWS angles around it, into a colour atlas and a normal atlas. Past `near`
// metres a tree is drawn as one camera-facing quad showing the photo taken
// from the angle nearest the camera's, lit per pixel from the baked normals
// so it shades like the real thing by day and by night. Only the trees near
// the camera are drawn in full.

const VIEWS = 8;
const TILE_PX = 256;
// The full-detail set is rebuilt whenever the camera has moved half this far,
// and holds every tree within near + MARGIN, so none goes missing in between.
const MARGIN = 20;
// Metres over which a tree dissolves between full detail and its impostor.
const BLEND = 30;

export interface ForestKind {
  wood?: BufferGeometry;
  leaves: BufferGeometry;
  bark: MeshStandardMaterial;
  leaf: MeshStandardMaterial;
  matrices: Matrix4[];
  colors?: Color[];
}

interface Baked {
  albedo: Texture;
  normal: Texture;
  size: Vector3; // quad width, quad height, quad bottom, in the tree's own units
}

const bakeVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const bakeFragment = (normals: boolean) => /* glsl */ `
  uniform sampler2D map;
  uniform float alphaTest;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vec4 c = texture2D(map, vUv);
    if (c.a < alphaTest) discard;
    ${normals ? "gl_FragColor = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0);" : "gl_FragColor = vec4(c.rgb, 1.0);\n#include <colorspace_fragment>"}
  }
`;

function bakeMaterial(source: MeshStandardMaterial, normals: boolean) {
  return new ShaderMaterial({
    uniforms: { map: { value: source.map }, alphaTest: { value: source.alphaTest } },
    vertexShader: bakeVertex,
    fragmentShader: bakeFragment(normals),
    side: source.side === DoubleSide ? DoubleSide : FrontSide,
  });
}

const baked = new WeakMap<BufferGeometry, Baked>();

function bake(gl: WebGLRenderer, kind: ForestKind): Baked {
  const hit = baked.get(kind.leaves);
  if (hit) return hit;
  const parts = [kind.leaves, ...(kind.wood ? [kind.wood] : [])];
  const box = new Box3();
  let radius = 0;
  const v = new Vector3();
  for (const g of parts) {
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      box.expandByPoint(v);
      radius = Math.max(radius, Math.hypot(v.x, v.z));
    }
  }
  const width = radius * 2.04;
  const height = (box.max.y - box.min.y) * 1.02;
  const bottom = box.min.y - (box.max.y - box.min.y) * 0.01;
  const tileH = Math.min(512, Math.max(64, Math.round((TILE_PX * height) / width / 8) * 8));

  const target = (colorSpace: string) => {
    const t = new WebGLRenderTarget(TILE_PX * VIEWS, tileH, { depthBuffer: true });
    t.texture.colorSpace = colorSpace;
    t.texture.generateMipmaps = true;
    t.texture.minFilter = LinearMipmapLinearFilter;
    t.texture.anisotropy = 4;
    return t;
  };
  const albedo = target(SRGBColorSpace);
  const normal = target(NoColorSpace);

  const scene = new Scene();
  const meshes = [
    new Mesh(kind.leaves, bakeMaterial(kind.leaf, false)),
    ...(kind.wood ? [new Mesh(kind.wood, bakeMaterial(kind.bark, false))] : []),
  ];
  meshes.forEach((m) => scene.add(m));
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, radius * 4 + 20);
  const cy = bottom + height / 2;

  const saved = { target: gl.getRenderTarget(), color: gl.getClearColor(new Color()), alpha: gl.getClearAlpha(), autoClear: gl.autoClear };
  gl.autoClear = false;
  for (const [rt, normals] of [[albedo, false], [normal, true]] as const) {
    meshes[0].material = bakeMaterial(kind.leaf, normals);
    if (meshes[1]) meshes[1].material = bakeMaterial(kind.bark, normals);
    gl.setRenderTarget(rt);
    // Clear to a leaf-ish green (or a camera-facing normal) at zero alpha,
    // so the edges don't fade to black in the distant mipmaps.
    gl.setClearColor(normals ? new Color(0.5, 0.5, 1) : new Color(0.06, 0.09, 0.03), 0);
    gl.clear();
    for (let k = 0; k < VIEWS; k++) {
      const phi = (k / VIEWS) * Math.PI * 2;
      const d = radius * 2 + 10;
      camera.position.set(Math.sin(phi) * d, cy, Math.cos(phi) * d);
      camera.lookAt(0, cy, 0);
      camera.updateMatrixWorld();
      rt.viewport.set(k * TILE_PX, 0, TILE_PX, tileH);
      rt.scissor.set(k * TILE_PX, 0, TILE_PX, tileH);
      rt.scissorTest = true;
      gl.setRenderTarget(rt);
      gl.render(scene, camera);
    }
    rt.scissorTest = false;
  }
  gl.setRenderTarget(saved.target);
  gl.setClearColor(saved.color, saved.alpha);
  gl.autoClear = saved.autoClear;
  meshes.forEach((m) => (m.material as ShaderMaterial).dispose());

  const result = { albedo: albedo.texture, normal: normal.texture, size: new Vector3(width, height, bottom) };
  baked.set(kind.leaves, result);
  return result;
}

// Shared by every material of one forest, set each frame from the camera.
// Between near - blend and near, the full tree and its impostor are dithered
// into each other (see dither.ts) so the switch doesn't pop.
interface Shared {
  eye: { value: Vector3 };
  near: { value: number };
  fade: { value: Vector2 }; // [near - blend, near]
}

const impostorVertexHead = /* glsl */ `
  #include <common>
  uniform vec3 uEye;
  uniform vec2 uFade;
  uniform vec3 uSize;
  varying vec2 vQuadUv;
  varying float vBearing;
  varying float vFadeDistance;
  varying vec3 vAxisX;
  varying vec3 vAxisZ;
`;

// Replaces three's projection: the quad stands at the instance's origin,
// turned about the vertical to face the camera, and is collapsed to a point
// (drawing nothing) when the camera is close enough for the full tree alone.
const impostorProject = /* glsl */ `
  mat4 inst = modelMatrix * instanceMatrix;
  vec3 origin = inst[3].xyz;
  float sx = length(inst[0].xyz);
  float sy = length(inst[1].xyz);
  vAxisX = inst[0].xyz / sx;
  vAxisZ = normalize(inst[2].xyz);
  vec3 toEye = uEye - origin;
  vec3 hdir = normalize(vec3(toEye.x, 0.0, toEye.z) + vec3(1e-4, 0.0, 0.0));
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), hdir));
  // The camera's bearing in the tree's own frame, in photo steps.
  vBearing = atan(dot(hdir, vAxisX), dot(hdir, vAxisZ)) / (6.2831853 / ${VIEWS}.0);
  vQuadUv = uv;
  vFadeDistance = length(toEye);
  vec3 world = origin + right * (position.x * uSize.x * sx) + vec3(0.0, (uSize.z + position.y * uSize.y) * sy, 0.0);
  if (vFadeDistance < uFade.x) world = origin;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
`;

const impostorFragmentHead = /* glsl */ `
  #include <common>
  uniform sampler2D uNormalMap;
  uniform vec2 uFade;
  varying vec2 vQuadUv;
  varying float vBearing;
  varying float vFadeDistance;
  varying vec3 vAxisX;
  varying vec3 vAxisZ;
  ${DITHER_GLSL}
`;

// Fades in over the band, and blends between the two photos either side of
// the camera's bearing by dithering which one each pixel shows, so a tree
// doesn't flick from one angle to the next as you pass it. Sampled with the
// quad's own smooth gradients, so the jump between photos in the atlas
// doesn't upset mipmapping.
const impostorMap = /* glsl */ `
  if (!ditherKeep(vFadeDistance, uFade, vec2(0.0))) discard;
  float bearingStep = floor(vBearing);
  float view = mod(bearingStep + (ditherNoise(gl_FragCoord.xy + vec2(41.0, 23.0)) < fract(vBearing) ? 1.0 : 0.0), ${VIEWS}.0);
  vec2 quadUv = vec2(vQuadUv.x / ${VIEWS}.0, vQuadUv.y);
  vec2 atlasUv = quadUv + vec2(view / ${VIEWS}.0, 0.0);
  vec2 uvDx = dFdx(quadUv), uvDy = dFdy(quadUv);
  diffuseColor *= textureGrad(map, atlasUv, uvDx, uvDy);
`;

// The baked normal is in the photographing camera's frame: x to its right,
// y up, z back toward it. Turn it into the tree's frame, then the world's.
const impostorNormal = /* glsl */ `
  #include <normal_fragment_begin>
  {
    vec3 nb = textureGrad(uNormalMap, atlasUv, uvDx, uvDy).xyz * 2.0 - 1.0;
    float pk = view * (6.2831853 / ${VIEWS}.0);
    vec3 nLocal = nb.x * vec3(cos(pk), 0.0, -sin(pk)) + nb.y * vec3(0.0, 1.0, 0.0) + nb.z * vec3(sin(pk), 0.0, cos(pk));
    vec3 axisY = normalize(cross(vAxisZ, vAxisX));
    vec3 nWorld = normalize(nLocal.x * vAxisX + nLocal.y * axisY + nLocal.z * vAxisZ);
    normal = normalize((viewMatrix * vec4(nWorld, 0.0)).xyz);
  }
`;

function impostorMaterial(bakedKind: Baked, leaf: MeshStandardMaterial, shared: Shared) {
  const m = new MeshStandardMaterial({ map: bakedKind.albedo, alphaTest: 0.42, side: DoubleSide, roughness: leaf.roughness, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uEye = shared.eye;
    shader.uniforms.uFade = shared.fade;
    shader.uniforms.uSize = { value: bakedKind.size };
    shader.uniforms.uNormalMap = { value: bakedKind.normal };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", impostorVertexHead)
      .replace("#include <project_vertex>", impostorProject);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", impostorFragmentHead)
      .replace("#include <map_fragment>", impostorMap)
      .replace("#include <normal_fragment_begin>", impostorNormal);
  };
  m.customProgramCacheKey = () => "tree-impostor";
  return m;
}

// The full-detail materials: dissolving over the band and drawing nothing
// past `near`, where the impostor has taken over.
function nearMaterial(source: MeshStandardMaterial, shared: Shared) {
  const m = source.clone();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uEye = shared.eye;
    shader.uniforms.uFade = shared.fade;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uEye;\nuniform vec2 uFade;\nvarying float vFadeDistance;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvFadeDistance = distance((modelMatrix * instanceMatrix)[3].xyz, uEye);\nif (vFadeDistance >= uFade.y) transformed = vec3(0.0);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec2 uFade;\nvarying float vFadeDistance;\n" + DITHER_GLSL)
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (!ditherKeep(vFadeDistance, vec2(0.0), uFade)) discard;");
  };
  m.customProgramCacheKey = () => "tree-near";
  return m;
}

// A unit quad: x across [-0.5, 0.5], y up [0, 1].
const quad = (() => {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
})();

interface KindMeshes {
  positions: Vector3[];
  kind: ForestKind;
  near: InstancedMesh[];
}

const local = new Vector3();
const inverse = new Matrix4();

// Trees of several kinds: impostors for all of them, full trees for those
// within `near` metres of the camera. `shadows` lets the full trees cast and
// receive shadows; the impostors never do.
export function Forest({ kinds, near, shadows = false }: { kinds: ForestKind[]; near: number; shadows?: boolean }) {
  const gl = useThree((s) => s.gl);
  const { group, sets, shared } = useMemo(() => {
    const blend = Math.min(BLEND, near * 0.3);
    const shared: Shared = { eye: { value: new Vector3(0, 1e6, 0) }, near: { value: near }, fade: { value: new Vector2(near - blend, near) } };
    const group = new Group();
    const sets: KindMeshes[] = [];
    for (const kind of kinds) {
      if (!kind.matrices.length) continue;
      const b = bake(gl, kind);
      const far = new InstancedMesh(quad, impostorMaterial(b, kind.leaf, shared), kind.matrices.length);
      kind.matrices.forEach((m, i) => {
        far.setMatrixAt(i, m);
        if (kind.colors) far.setColorAt(i, kind.colors[i]);
      });
      far.frustumCulled = false; // the quads are placed in the shader
      group.add(far);
      const nearMeshes = [
        new InstancedMesh(kind.leaves, nearMaterial(kind.leaf, shared), kind.matrices.length),
        ...(kind.wood ? [new InstancedMesh(kind.wood, nearMaterial(kind.bark, shared), kind.matrices.length)] : []),
      ];
      for (const m of nearMeshes) {
        if (kind.colors) m.setColorAt(0, kind.colors[0]); // so the colour attribute exists from the start
        m.count = 0;
        m.castShadow = m.receiveShadow = shadows;
        group.add(m);
      }
      sets.push({ kind, near: nearMeshes, positions: kind.matrices.map((m) => new Vector3().setFromMatrixPosition(m)) });
    }
    return { group, sets, shared };
  }, [gl, kinds, near]);

  const last = useMemo(() => new Vector3(1e9, 0, 0), [sets]);
  useFrame(({ camera }) => {
    camera.getWorldPosition(shared.eye.value);
    // Measured in the forest's own space: in the driving scenes the camera
    // stays put and the world moves past it.
    inverse.copy(group.matrixWorld).invert();
    local.copy(shared.eye.value).applyMatrix4(inverse);
    if (last.distanceTo(local) < MARGIN / 2) return;
    last.copy(local);
    const reach = (near + MARGIN) ** 2;
    for (const { kind, near: meshes, positions } of sets) {
      let n = 0;
      positions.forEach((p, i) => {
        if (p.distanceToSquared(local) > reach) return;
        for (const m of meshes) {
          m.setMatrixAt(n, kind.matrices[i]);
          if (kind.colors) m.setColorAt(n, kind.colors[i]);
        }
        n++;
      });
      for (const m of meshes) {
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.computeBoundingSphere();
      }
    }
  });
  return <primitive object={group} />;
}
