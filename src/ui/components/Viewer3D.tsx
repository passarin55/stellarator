/**
 * three.js viewer for stellarator geometry: Fourier surfaces (with scalar
 * colour maps), filament coils rendered as tubes, and 3D field-line traces.
 * Z is up, units are metres.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { colormap, type ColormapName } from '../lib/colormap';
import { ColorbarLegend } from './Plot';
import { IconCamera } from './Icons';

export interface SurfaceLayer {
  /** (nphi+1)·(ntheta+1) vertices, θ fastest */
  positions: Float32Array;
  ntheta: number;
  nphi: number;
  scalars?: Float32Array;
  colormap?: ColormapName;
  range?: [number, number];
  color?: string;
  opacity?: number;
  wireframe?: boolean;
}

export interface CoilLayer {
  points: Float64Array;
  color: string;
  radius?: number;
}

export interface LineLayer {
  points: Float32Array;
  color: string;
  opacity?: number;
}

export interface Viewer3DProps {
  surfaces?: SurfaceLayer[];
  coils?: CoilLayer[];
  lines?: LineLayer[];
  height?: number;
  colorbar?: { name: ColormapName; lo: number; hi: number; label: string };
  /** change to re-fit the camera */
  fitKey?: string;
  overlay?: React.ReactNode;
  autoRotate?: boolean;
}

export function Viewer3D(props: Viewer3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    content: THREE.Group;
    raf: number;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fitted = useRef<string | undefined>(undefined);

  // one-time setup
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      setErr('WebGL is not available in this browser — 3D view disabled (all computations still work).');
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 0.01, 1000);
    camera.up.set(0, 0, 1);
    camera.position.set(10, -10, 7);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.6);
    d1.position.set(5, -8, 10);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x99bbff, 0.6);
    d2.position.set(-6, 6, -4);
    scene.add(d2);
    const content = new THREE.Group();
    scene.add(content);
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      ctx.current!.raf = requestAnimationFrame(loop);
    };
    ctx.current = { renderer, scene, camera, controls, content, raf: 0 };
    loop();
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(ctx.current?.raf ?? 0);
      controls.dispose();
      disposeGroup(content);
      renderer.dispose();
      el.removeChild(renderer.domElement);
      ctx.current = null;
    };
  }, []);

  useEffect(() => {
    if (ctx.current) ctx.current.controls.autoRotate = !!props.autoRotate;
  }, [props.autoRotate]);

  // content updates
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    disposeGroup(c.content);
    c.content.clear();
    for (const s of props.surfaces ?? []) c.content.add(buildSurface(s));
    for (const coil of props.coils ?? []) c.content.add(buildCoil(coil));
    for (const l of props.lines ?? []) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(l.points, 3));
      const m = new THREE.LineBasicMaterial({ color: l.color, transparent: (l.opacity ?? 1) < 1, opacity: l.opacity ?? 1 });
      c.content.add(new THREE.Line(g, m));
    }
    const key = props.fitKey ?? 'default';
    if (fitted.current !== key && c.content.children.length) {
      const box = new THREE.Box3().setFromObject(c.content);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      if (Number.isFinite(sphere.radius) && sphere.radius > 0) {
        const r = sphere.radius;
        c.controls.target.copy(sphere.center);
        c.camera.position.copy(sphere.center).add(new THREE.Vector3(r * 1.6, -r * 1.9, r * 1.35));
        c.camera.near = r / 100;
        c.camera.far = r * 100;
        c.camera.updateProjectionMatrix();
        fitted.current = key;
      }
    }
  }, [props.surfaces, props.coils, props.lines, props.fitKey]);

  const snapshot = () => {
    const c = ctx.current;
    if (!c) return;
    c.renderer.render(c.scene, c.camera);
    const a = document.createElement('a');
    a.href = c.renderer.domElement.toDataURL('image/png');
    a.download = 'stellarator-view.png';
    a.click();
  };

  return (
    <div className="viewer" ref={host} style={{ height: props.height ?? 520 }}>
      {err && <div className="note warnbox" style={{ margin: 16 }}>{err}</div>}
      {props.colorbar && <ColorbarLegend {...props.colorbar} />}
      <div className="viewer-overlay">drag: rotate · right-drag: pan · wheel: zoom</div>
      <div style={{ position: 'absolute', left: 10, top: 10, display: 'flex', gap: 6 }}>
        <button className="btn sm" onClick={snapshot} title="Save PNG screenshot">
          <IconCamera size={14} /> PNG
        </button>
        {props.overlay}
      </div>
    </div>
  );
}

function buildSurface(s: SurfaceLayer): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(s.positions, 3));
  const nt = s.ntheta + 1;
  const idx: number[] = [];
  for (let j = 0; j < s.nphi; j++)
    for (let i = 0; i < s.ntheta; i++) {
      const a = j * nt + i;
      const b = j * nt + i + 1;
      const c = (j + 1) * nt + i;
      const d = (j + 1) * nt + i + 1;
      idx.push(a, c, b, b, c, d);
    }
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: s.scalars ? 0xffffff : (s.color ?? '#7dd3fc'),
    vertexColors: !!s.scalars,
    side: THREE.DoubleSide,
    roughness: 0.45,
    metalness: 0.05,
    transparent: (s.opacity ?? 1) < 1,
    opacity: s.opacity ?? 1,
    wireframe: !!s.wireframe,
    depthWrite: (s.opacity ?? 1) >= 1,
  });
  if (s.scalars) {
    const cols = new Float32Array(s.scalars.length * 3);
    let [lo, hi] = s.range ?? [Infinity, -Infinity];
    if (!s.range)
      for (const v of s.scalars) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    for (let i = 0; i < s.scalars.length; i++) {
      const [r, gg, b] = colormap(s.colormap ?? 'viridis', (s.scalars[i] - lo) / (hi - lo || 1));
      cols[3 * i] = r;
      cols[3 * i + 1] = gg;
      cols[3 * i + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  return new THREE.Mesh(g, mat);
}

function buildCoil(c: CoilLayer): THREE.Mesh {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < c.points.length; i += 3) pts.push(new THREE.Vector3(c.points[i], c.points[i + 1], c.points[i + 2]));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const g = new THREE.TubeGeometry(curve, Math.max(64, pts.length * 2), c.radius ?? 0.04, 8, true);
  const m = new THREE.MeshStandardMaterial({ color: c.color, roughness: 0.35, metalness: 0.55 });
  return new THREE.Mesh(g, m);
}

function disposeGroup(g: THREE.Group) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
