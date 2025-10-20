// main.ts
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// === Config you might change ===
const GLB_URL = "/models/possystem4.glb";
const SCREEN_MAT_NAME = "material.003"; // case-insensitive

// ---------- renderer / scene / camera ----------
const canvas = document.getElementById("webgl") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// @ts-ignore (older three versions)
renderer.physicallyCorrectLights = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 6);
camera.lookAt(new THREE.Vector3(0, 0.7, 0));

// Cursor tilt
const mouse = new THREE.Vector2(0, 0);
const targetMouse = new THREE.Vector2(0, 0);
const MAX_YAW   = THREE.MathUtils.degToRad(4);
const MAX_PITCH = THREE.MathUtils.degToRad(0);
const TILT_EASE = 0.2;
window.addEventListener("pointermove", (e) => {
  targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  targetMouse.y = (e.clientY / window.innerHeight) * 2 - 1;
});
["pointerleave","blur"].forEach(evt => window.addEventListener(evt, () => targetMouse.set(0,0)));

// ---------- environment & lights ----------
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const hemi = new THREE.HemisphereLight(0xffffff, 0x202028, 0.35);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(-1.2, 6, 4);
dir.castShadow = true;
dir.shadow.mapSize.set(1024, 1024);
dir.shadow.radius = 4;
dir.shadow.normalBias = 0.02;
scene.add(dir);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.ShadowMaterial({ opacity: 0.18 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.2;
ground.receiveShadow = true;
scene.add(ground);

// ---------- HTML → Canvas → Texture (in-iframe html2canvas) ----------
let TEX_W = 1024, TEX_H = 1024; // will be updated to match the screen aspect

function makeScreenCanvas() {
  let c = document.getElementById('screenCanvas') as HTMLCanvasElement | null;
  if (!c) {
    c = document.createElement('canvas');
    c.id = 'screenCanvas';
    c.width = TEX_W; c.height = TEX_H;
    c.style.display = 'none';
    document.body.appendChild(c);
  }
  return c;
}
const screenCanvas = makeScreenCanvas();
const screenCtx = screenCanvas.getContext('2d')!;

const screenTex = new THREE.CanvasTexture(screenCanvas);
screenTex.wrapS = THREE.ClampToEdgeWrapping;
screenTex.wrapT = THREE.ClampToEdgeWrapping;
screenTex.colorSpace = THREE.SRGBColorSpace;
screenTex.flipY = false;
// NPOT safe defaults:
screenTex.generateMipmaps = false;
screenTex.minFilter = THREE.LinearFilter;
screenTex.magFilter = THREE.LinearFilter;
screenTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

// Hidden iframe that renders the UI we capture
const screenFrame = document.createElement('iframe');
screenFrame.src = '/screen.html';
Object.assign(screenFrame.style, {
  position: 'fixed',
  left: '0px',
  top: '0px',
  width: `${TEX_W}px`,
  height: `${TEX_H}px`,
  opacity: '0',
  pointerEvents: 'none',
  border: '0',
  zIndex: '-1'
} as CSSStyleDeclaration);
document.body.appendChild(screenFrame);

let screenRoot: HTMLElement | null = null;
let h2c: any = null;
let capturing = false;
let lastCapture = 0;
const SCREEN_FPS = 30;

async function waitFonts(doc: Document) {
  try {
    // @ts-ignore
    if (doc?.fonts?.ready) await (doc as any).fonts.ready;
  } catch {}
}

async function injectHtml2Canvas(doc: Document) {
  if ((screenFrame.contentWindow as any)?.html2canvas) {
    h2c = (screenFrame.contentWindow as any).html2canvas;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('html2canvas failed to load'));
    doc.head.appendChild(s);
  });
  h2c = (screenFrame.contentWindow as any).html2canvas;
}

// Resize capture pipeline to match screen aspect
function resizeScreenCaptureToAspect(aspect: number) {
  TEX_H = 1024;
  TEX_W = Math.max(2, Math.round(TEX_H * aspect));

  // canvas
  screenCanvas.width  = TEX_W;
  screenCanvas.height = TEX_H;

  // iframe box + html root
  screenFrame.style.width  = `${TEX_W}px`;
  screenFrame.style.height = `${TEX_H}px`;
  if (screenRoot) {
    (screenRoot as HTMLElement).style.width  = `${TEX_W}px`;
    (screenRoot as HTMLElement).style.height = `${TEX_H}px`;
  }

  // NPOT-safe sampling (already set above, but re-affirm)
  screenTex.generateMipmaps = false;
  screenTex.minFilter = THREE.LinearFilter;
  screenTex.magFilter = THREE.LinearFilter;
  screenTex.needsUpdate = true;
}

async function captureHTMLToCanvas() {
  if (!screenRoot || !h2c || capturing) return;
  capturing = true;
  try {
    const snap = await h2c(screenRoot, {
      backgroundColor: null,
      useCORS: true,
      foreignObjectRendering: true,
      width: TEX_W,
      height: TEX_H,
      windowWidth: TEX_W,
      windowHeight: TEX_H,
      scale: 1,
      logging: false
    });
    screenCtx.clearRect(0, 0, TEX_W, TEX_H);
    screenCtx.drawImage(snap, 0, 0, TEX_W, TEX_H);
    screenTex.needsUpdate = true;
  } catch (e) {
    console.warn('[html2canvas] snapshot failed:', e);
  } finally {
    capturing = false;
  }
}

screenFrame.addEventListener('load', async () => {
  const doc = screenFrame.contentDocument!;
  screenRoot = doc.getElementById('screen-root');
  if (!screenRoot) {
    console.warn('screen.html missing #screen-root');
    return;
  }
  (screenRoot as HTMLElement).style.width = `${TEX_W}px`;
  (screenRoot as HTMLElement).style.height = `${TEX_H}px`;

  await injectHtml2Canvas(doc);
  await waitFonts(doc);
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => setTimeout(r, 50));
  await captureHTMLToCanvas();

  const Observer = (screenFrame.contentWindow as any).MutationObserver || MutationObserver;
  const mo = new Observer(() => captureHTMLToCanvas());
  mo.observe(screenRoot, { attributes:true, childList:true, characterData:true, subtree:true });

  screenFrame.contentWindow?.addEventListener('resize', () => captureHTMLToCanvas());
});

// ---------- UVs for a specific material group + aspect ----------
function setUVsForMaterialGroupAndGetAspect(
  geom: THREE.BufferGeometry,
  materialIndex: number
): number {
  const pos = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos) return 1;

  const indexAttr = geom.getIndex() as THREE.BufferAttribute | null;
  const idxArray = indexAttr ? (indexAttr.array as ArrayLike<number>) : null;

  const groups = geom.groups?.length
    ? geom.groups
    : [{ start: 0, count: (idxArray ? idxArray.length : pos.count), materialIndex: 0 }];

  const group = groups.find(g => g.materialIndex === materialIndex) ?? groups[0];
  const start = group.start;
  const end = group.start + group.count;

  const used = new Set<number>();
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), nSum = new THREE.Vector3();

  const min = new THREE.Vector3( Infinity,  Infinity,  Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  const getIndex = (i: number) => (idxArray ? idxArray[i] : i);

  for (let i = start; i < end; i += 3) {
    const ia = getIndex(i), ib = getIndex(i+1), ic = getIndex(i+2);
    used.add(ia); used.add(ib); used.add(ic);

    v0.set(pos.getX(ia), pos.getY(ia), pos.getZ(ia));
    v1.set(pos.getX(ib), pos.getY(ib), pos.getZ(ib));
    v2.set(pos.getX(ic), pos.getY(ic), pos.getZ(ic));

    min.min(v0); min.min(v1); min.min(v2);
    max.max(v0); max.max(v1); max.max(v2);

    e1.subVectors(v1, v0);
    e2.subVectors(v2, v0);
    n.crossVectors(e1, e2);
    nSum.add(n);
  }

  // choose projection plane
  let uAxis: 'x'|'y'|'z', vAxis: 'x'|'y'|'z';
  if (nSum.lengthSq() > 1e-12) {
    nSum.normalize();
    const ax = Math.abs(nSum.x), ay = Math.abs(nSum.y), az = Math.abs(nSum.z);
    if (ax >= ay && ax >= az) { uAxis = 'y'; vAxis = 'z'; }
    else if (ay >= ax && ay >= az) { uAxis = 'x'; vAxis = 'z'; }
    else { uAxis = 'x'; vAxis = 'y'; }
  } else {
    const span = new THREE.Vector3().subVectors(max, min);
    const entries = [
      {ax:'x' as const, v: span.x},
      {ax:'y' as const, v: span.y},
      {ax:'z' as const, v: span.z},
    ].sort((a,b)=>b.v - a.v);
    uAxis = entries[0].ax; vAxis = entries[1].ax;
  }

  const uMin = (min as any)[uAxis], vMin = (min as any)[vAxis];
  const uSpan = Math.max(1e-6, (max as any)[uAxis] - uMin);
  const vSpan = Math.max(1e-6, (max as any)[vAxis] - vMin);
  const aspect = uSpan / vSpan;

  if (!geom.getAttribute('uv')) {
    geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }
  const uv = geom.getAttribute('uv') as THREE.BufferAttribute;

  used.forEach((vi) => {
    const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
    const obj: Record<'x'|'y'|'z', number> = {x,y,z};
    const U = (obj[uAxis] - uMin) / uSpan;
    const V = 1 - (obj[vAxis] - vMin) / vSpan;
    uv.setXY(vi, U, V);
  });
  uv.needsUpdate = true;
  geom.attributes.uv.needsUpdate = true;

  return aspect;
}

// ---------- rig ----------
const rig = new THREE.Group();
scene.add(rig);

// ---------- Loader overlay ----------
function makeLoader() {
  const style = document.createElement('style');
  style.textContent = `
  #page-loader{position:fixed; inset:0; background:#0b0f14; color:#cfe9ff;
  display:flex; align-items:center; justify-content:center; z-index:9999;
  transition:opacity .35s ease; opacity:1;}
  #page-loader.hidden{ opacity:0; pointer-events:none; }
  .loader-box{ width:min(420px,80vw); text-align:center; }
  .loader-title{ font:600 18px/1.2 system-ui, Inter, Segoe UI, sans-serif; margin-bottom:14px; }
  .loader-bar{ height:6px; width:100%; background:rgba(255,255,255,.12); border-radius:999px; overflow:hidden; }
  .loader-fill{ height:100%; width:0%; background:#50bfff; border-radius:999px; transition:width .12s linear; }
  .loader-sub{ font:400 12px/1.2 system-ui, Inter, Segoe UI, sans-serif; opacity:.7; margin-top:10px; }
  `;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'page-loader';
  root.innerHTML = `
    <div class="loader-box">
      <div class="loader-title">Loading 3D model…</div>
      <div class="loader-bar"><div class="loader-fill"></div></div>
      <div class="loader-sub" id="loader-sub">Initializing…</div>
    </div>`;
  document.body.appendChild(root);
  const fill = root.querySelector('.loader-fill') as HTMLDivElement;
  const sub  = root.querySelector('#loader-sub') as HTMLDivElement;
  return {
    progress(p: number) {
      if (!isFinite(p)) return;
      const pct = Math.max(0, Math.min(100, Math.round(p * 100)));
      fill.style.width = `${pct}%`;
      sub.textContent = pct < 100 ? `Loading… ${pct}%` : `Finalizing…`;
    },
    done() {
      root.classList.add('hidden');
      setTimeout(() => root.remove(), 400);
    },
    error(msg: string) {
      sub.textContent = msg || 'Failed to load model.';
      setTimeout(() => this.done(), 1200);
    }
  };
}
const loaderUI = makeLoader();

// ---------- Apply texture to the screen material ----------
function applyHTMLTextureToScreen(root: THREE.Object3D) {
  root.traverse((o: any) => {
    if (!o.isMesh) return;

    const mats = Array.isArray(o.material) ? o.material.slice() : [o.material];
    const idx = mats.findIndex((m:any) => (m?.name || '').trim().toLowerCase() === SCREEN_MAT_NAME.toLowerCase());
    if (idx === -1) return;

    // 1) Generate UVs for just this material group + get aspect
    const aspect = setUVsForMaterialGroupAndGetAspect(o.geometry as THREE.BufferGeometry, idx);

    // 2) Resize capture pipeline to match aspect
    resizeScreenCaptureToAspect(aspect);

    // 3) Clone & swap only that sub-material; drive from emissive map
    const baseMat = mats[idx];
    const m = baseMat.clone();
    m.color = new THREE.Color(0x000000);
    m.map = null;
    m.emissive = new THREE.Color(0xffffff);
    m.emissiveMap = screenTex;
    m.emissiveIntensity = 1.6;
    m.toneMapped = true;
    m.side = THREE.DoubleSide; // screens are thin planes
    m.needsUpdate = true;

    mats[idx] = m;
    o.material = Array.isArray(o.material) ? mats : mats[0];

    o.castShadow = false;
    o.receiveShadow = false;
  });
}

// ---------- Load GLB ----------
const gltfLoader = new GLTFLoader();
gltfLoader.load(
  GLB_URL,
  (gltf) => {
    const model = gltf.scene;
    model.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    const maxSide = Math.max(size.x, size.y, size.z) || 1;
    const targetSize = 2.2;
    const scale = targetSize / maxSide;
    model.scale.setScalar(scale);
    box.setFromObject(model);
    const center = new THREE.Vector3(); box.getCenter(center);
    model.position.sub(center);

    applyHTMLTextureToScreen(model);
    rig.add(model);

    onResize();
    loaderUI.done();
    animate();
  },
  (e) => { if (e && e.total) loaderUI.progress(e.loaded / e.total); },
  (err) => { console.error("GLB load error", err); loaderUI.error("Failed to load model."); }
);

// ---------- Scroll-follow keyframes ----------
const keyframes = [
  { section: "#home",    pos: new THREE.Vector3(1, 0.5, 2.7), rot: new THREE.Euler(0.0, -0.75, 0.0), scale: 1.15 },
  { section: "#about",   pos: new THREE.Vector3(1.5, 1.18, 0.4), rot: new THREE.Euler(0.0, -0.25, 0.0), scale: 1.15 },
  { section: "#inquire", pos: new THREE.Vector3(0.0, -.1, 1.5),  rot: new THREE.Euler(0.0,  0.00, 0.0), scale: 1.9 },
];
const sections = keyframes.map(k => document.querySelector(k.section) as HTMLElement);

let sectionTops: number[] = [];
let currentIndex = 0;
let isPaging = false;
let targetIndex = 0;

function computeSectionTops() {
  sectionTops = sections.map(el => el.getBoundingClientRect().top + window.scrollY);
}
function closestSectionIndex(y: number) {
  let min = Infinity, idx = 0;
  for (let i = 0; i < sectionTops.length; i++) {
    const d = Math.abs(y - sectionTops[i]);
    if (d < min) { min = d; idx = i; }
  }
  return idx;
}
function scrollToIndex(i: number) {
  i = Math.max(0, Math.min(sections.length - 1, i));
  isPaging = true; targetIndex = i;
  window.scrollTo({ top: sectionTops[i], behavior: "smooth" });
}
let settleCheckId: number | null = null;
function startSettleWatcher() {
  if (settleCheckId) return;
  settleCheckId = window.setInterval(() => {
    const t = sectionTops[targetIndex];
    if (Math.abs(window.scrollY - t) < 2) {
      isPaging = false; currentIndex = targetIndex;
      clearInterval(settleCheckId!); settleCheckId = null;
    }
  }, 30);
}

window.addEventListener("wheel", (e) => {
  e.preventDefault(); if (isPaging) return;
  const dir = Math.sign(e.deltaY);
  if (dir > 0) scrollToIndex(currentIndex + 1);
  else if (dir < 0) scrollToIndex(currentIndex - 1);
  startSettleWatcher();
}, { passive: false });

let touchStartY = 0;
window.addEventListener("touchstart", (e) => (touchStartY = e.touches[0].clientY), { passive: true });
window.addEventListener("touchend", (e) => {
  if (isPaging) return;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dy) < 40) return;
  if (dy < 0) scrollToIndex(currentIndex + 1);
  else scrollToIndex(currentIndex - 1);
  startSettleWatcher();
}, { passive: true });

window.addEventListener("keydown", (e) => {
  if (isPaging) return;
  if (["ArrowDown","PageDown"," "].includes(e.key)) { e.preventDefault(); scrollToIndex(currentIndex + 1); startSettleWatcher(); }
  else if (["ArrowUp","PageUp"].includes(e.key))   { e.preventDefault(); scrollToIndex(currentIndex - 1); startSettleWatcher(); }
});
document.querySelectorAll('header.nav a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (ev) => {
    ev.preventDefault();
    const id = (ev.currentTarget as HTMLAnchorElement).getAttribute("href")!;
    const idx = sections.findIndex((s) => "#" + s.id === id);
    if (idx >= 0) { scrollToIndex(idx); startSettleWatcher(); }
  });
});

// ---------- init ----------
computeSectionTops();
currentIndex = closestSectionIndex(window.scrollY);

// ---------- animate ----------
function animate() {
  const now = performance.now();
  if (screenRoot && h2c && now - lastCapture > 1000 / SCREEN_FPS) {
    lastCapture = now;
    captureHTMLToCanvas();
  }

  const y = window.scrollY + window.innerHeight * 0.5;
  const { i, t } = getSegmentAndT(y);

  const a = keyframes[i], b = keyframes[i + 1];
  const rigPos = new THREE.Vector3().copy(a.pos).lerp(b.pos, t);
  rig.position.copy(rigPos);

  const qA = new THREE.Quaternion().setFromEuler(a.rot);
  const qB = new THREE.Quaternion().setFromEuler(b.rot);
  const baseQ = new THREE.Quaternion().copy(qA).slerp(qB, t);
  mouse.x += (targetMouse.x - mouse.x) * TILT_EASE;
  mouse.y += (targetMouse.y - mouse.y) * TILT_EASE;
  const yaw = -mouse.x * MAX_YAW, pitch = mouse.y * MAX_PITCH;
  const tiltQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0));
  rig.quaternion.copy(baseQ).multiply(tiltQ);

  rig.scale.setScalar(a.scale + (b.scale - a.scale) * t);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// ---------- helpers ----------
function clamp01(x: number) { return Math.min(1, Math.max(0, x)); }
function getSegmentAndT(y: number) {
  if (y < sectionTops[0]) return { i: 0, t: 0 };
  for (let i = 0; i < sectionTops.length - 1; i++) {
    const start = sectionTops[i], end = sectionTops[i + 1];
    if (y >= start && y < end) return { i, t: clamp01((y - start) / (end - start)) };
  }
  return { i: keyframes.length - 2, t: 1 };
}
function onResize() {
  computeSectionTops();
  currentIndex = closestSectionIndex(window.scrollY);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", onResize);
