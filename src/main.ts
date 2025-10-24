// main.ts
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { initFeaturePods } from "./features-anim";
import { initPromoAndBand } from "./promo-band-anim";

const GLB_URL = "/models/possystem4.glb";
const SCREEN_MAT_NAME = "material.003";

const SCREENS = [
  { label: "POS Home", src: "/screen.html" },              
  { label: "Analytics", src: "/screens/screen-analytics.html" },
  { label: "Tiles",     src: "/screens/screen-tiles.html" },
];

const hero  = document.getElementById("home") as HTMLElement;
const stage = document.getElementById("stage") as HTMLDivElement;
const canvas = document.getElementById("webgl") as HTMLCanvasElement;
if (hero && stage && stage.parentElement !== hero) hero.appendChild(stage);
Object.assign(stage.style, {
  position: "absolute",
  inset: "0",
  zIndex: "0",
  pointerEvents: "none",
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// @ts-ignore
renderer.physicallyCorrectLights = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 1.2, 6);
camera.lookAt(new THREE.Vector3(0, 0.7, 0));

const heroFrame = document.querySelector("#home .hero-frame") as HTMLElement;

if (heroFrame && stage && stage.parentElement !== heroFrame) heroFrame.appendChild(stage);

Object.assign(stage.style, {
  position: "absolute",
  inset: "0",
  zIndex: "0",
  pointerEvents: "none",
});

function sizeToHero() {
  const r = heroFrame.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  canvas.style.width = "100%";
  canvas.style.height = "100%";
}
sizeToHero();
new ResizeObserver(sizeToHero).observe(heroFrame);
window.addEventListener("orientationchange", () => setTimeout(sizeToHero, 50));
window.addEventListener("resize", sizeToHero);

const mouse = new THREE.Vector2(0, 0);
const targetMouse = new THREE.Vector2(0, 0);
const MAX_YAW = THREE.MathUtils.degToRad(4);
const MAX_PITCH = THREE.MathUtils.degToRad(0);
const TILT_EASE = 0.2;
window.addEventListener("pointermove", (e) => {
  const r = heroFrame.getBoundingClientRect();
  if (r.bottom <= 0 || r.top >= window.innerHeight) return targetMouse.set(0, 0);
  const nx = (e.clientX - r.left) / Math.max(1, r.width);
  const ny = (e.clientY - r.top) / Math.max(1, r.height);
  targetMouse.set(nx * 2 - 1, ny * 2 - 1);
});
["pointerleave", "blur"].forEach((evt) => window.addEventListener(evt, () => targetMouse.set(0, 0)));

// env + lights + ground
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

/* ---------- HTML → canvas → texture for the device screen ---------- */
let TEX_W = 1024, TEX_H = 1024;
function makeScreenCanvas() {
  let c = document.getElementById("screenCanvas") as HTMLCanvasElement | null;
  if (!c) {
    c = document.createElement("canvas");
    c.id = "screenCanvas";
    c.width = TEX_W; c.height = TEX_H;
    c.style.display = "none";
    document.body.appendChild(c);
  }
  return c;
}
const screenCanvas = makeScreenCanvas();
const screenCtx = screenCanvas.getContext("2d")!;
const screenTex = new THREE.CanvasTexture(screenCanvas);
screenTex.wrapS = THREE.ClampToEdgeWrapping;
screenTex.wrapT = THREE.ClampToEdgeWrapping;
screenTex.colorSpace = THREE.SRGBColorSpace;
screenTex.flipY = false;
screenTex.generateMipmaps = false;
screenTex.minFilter = THREE.LinearFilter;
screenTex.magFilter = THREE.LinearFilter;
screenTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

const screenFrame = document.createElement("iframe");
screenFrame.src = SCREENS[0].src;
Object.assign(screenFrame.style, {
  position: "fixed",
  left: "0px",
  top: "0px",
  width: `${TEX_W}px`,
  height: `${TEX_H}px`,
  opacity: "0",
  pointerEvents: "none",
  border: "0",
  zIndex: "-1",
} as CSSStyleDeclaration);
document.body.appendChild(screenFrame);

let screenRoot: HTMLElement | null = null;
let h2c: any = null;
let capturing = false;
let lastCapture = 0;
let screenObserver: MutationObserver | null = null;
const SCREEN_FPS = 30;

async function waitFonts(doc: Document) {
  try { if ((doc as any)?.fonts?.ready) await (doc as any).fonts.ready; } catch {}
}
async function injectHtml2Canvas(doc: Document) {
  if ((screenFrame.contentWindow as any)?.html2canvas) {
    h2c = (screenFrame.contentWindow as any).html2canvas;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const s = doc.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("html2canvas failed to load"));
    doc.head.appendChild(s);
  });
  h2c = (screenFrame.contentWindow as any).html2canvas;
}
function resizeScreenCaptureToAspect(aspect: number) {
  TEX_H = 1024;
  TEX_W = Math.max(2, Math.round(TEX_H * aspect));
  screenCanvas.width = TEX_W; screenCanvas.height = TEX_H;
  screenFrame.style.width = `${TEX_W}px`;
  screenFrame.style.height = `${TEX_H}px`;
  if (screenRoot) {
    (screenRoot as HTMLElement).style.width = `${TEX_W}px`;
    (screenRoot as HTMLElement).style.height = `${TEX_H}px`;
  }
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
      backgroundColor: null, useCORS: true, foreignObjectRendering: true,
      width: TEX_W, height: TEX_H, windowWidth: TEX_W, windowHeight: TEX_H, scale: 1, logging: false,
    });
    screenCtx.clearRect(0, 0, TEX_W, TEX_H);
    screenCtx.drawImage(snap, 0, 0, TEX_W, TEX_H);
    screenTex.needsUpdate = true;
  } catch (e) {
    console.warn("[html2canvas] snapshot failed:", e);
  } finally { capturing = false; }
}
function setScreenSrc(src: string) {
  if (screenObserver) { screenObserver.disconnect(); screenObserver = null; }
  screenRoot = null;
  h2c = null;
  capturing = false;
  lastCapture = 0;
  screenFrame.src = src;
}
screenFrame.addEventListener("load", async () => {
  if (screenObserver) { screenObserver.disconnect(); screenObserver = null; }
  const doc = screenFrame.contentDocument!;
  screenRoot = doc.getElementById("screen-root");
  if (!screenRoot) { console.warn("screen page missing #screen-root"); return; }
  (screenRoot as HTMLElement).style.width  = `${TEX_W}px`;
  (screenRoot as HTMLElement).style.height = `${TEX_H}px`;
  await injectHtml2Canvas(doc);
  await waitFonts(doc);
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 50));
  await captureHTMLToCanvas();
  const Observer = (screenFrame.contentWindow as any).MutationObserver || MutationObserver;
  screenObserver = new Observer(() => captureHTMLToCanvas());
  screenObserver?.observe(screenRoot, { attributes: true, childList: true, characterData: true, subtree: true });
});

function iconSVG(kind: "grid"|"phone"|"book"|"default" = "default"){
  const common = 'width="18" height="18" viewBox="0 0 24 24" fill="currentColor"';
  switch (kind) {
    case "grid": return `<svg ${common}><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>`;
    case "phone":return `<svg ${common}><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.11.37 2.3.57 3.58.57a1 1 0 011 1V21a1 1 0 01-1 1C10.3 22 2 13.7 2 3a1 1 0 011-1h3.5a1 1 0 011 1c0 1.28.2 2.47.57 3.58a1 1 0 01-.24 1.01l-2.2 2.2z"/></svg>`;
    case "book": return `<svg ${common}><path d="M4 4a2 2 0 012-2h12a2 2 0 012 2v15a1 1 0 01-1.447.894L16 18.118l-3.553 1.776A1 1 0 0111 19V4H6a2 2 0 00-2 2v13a1 1 0 11-2 0V6a2 2 0 012-2z"/></svg>`;
    default:     return `<svg ${common}><circle cx="12" cy="12" r="9"/></svg>`;
  }
}

function mountScreenPicker() {
  const host = document.querySelector<HTMLElement>("#home .content"); 
  if (!host) return;

  const selector = document.createElement("div");
  selector.className = "screen-selector";

  const card = document.createElement("div");
  card.className = "screen-card";

  SCREENS.forEach((s, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "screen-item" + (i === 0 ? " is-active" : "");
    const icon = i === 0 ? "grid" : i === 1 ? "phone" : i === 2 ? "book" : "default";
    btn.innerHTML = `${iconSVG(icon as any)}<span>${s.label}</span>`;
    btn.addEventListener("click", () => {
      card.querySelectorAll(".screen-item").forEach(el => el.classList.remove("is-active"));
      btn.classList.add("is-active");
      setScreenSrc(s.src);
    });
    card.appendChild(btn);
  });

  selector.appendChild(card);
  host.appendChild(selector);
}


mountScreenPicker();

/* ---------- UVs for screen sub-material ---------- */
function setUVsForMaterialGroupAndGetAspect(geom: THREE.BufferGeometry, materialIndex: number): number {
  const pos = geom.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) return 1;
  const indexAttr = geom.getIndex() as THREE.BufferAttribute | null;
  const idxArray = indexAttr ? (indexAttr.array as ArrayLike<number>) : null;
  const groups = geom.groups?.length ? geom.groups : [{ start: 0, count: (idxArray ? idxArray.length : pos.count), materialIndex: 0 }];
  const group = groups.find((g) => g.materialIndex === materialIndex) ?? groups[0];
  const start = group.start, end = group.start + group.count;

  const used = new Set<number>();
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), nSum = new THREE.Vector3();
  const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const getIndex = (i: number) => (idxArray ? idxArray[i] : i);

  for (let i = start; i < end; i += 3) {
    const ia = getIndex(i), ib = getIndex(i + 1), ic = getIndex(i + 2);
    used.add(ia); used.add(ib); used.add(ic);
    v0.set(pos.getX(ia), pos.getY(ia), pos.getZ(ia));
    v1.set(pos.getX(ib), pos.getY(ib), pos.getZ(ib));
    v2.set(pos.getX(ic), pos.getY(ic), pos.getZ(ic));
    min.min(v0); min.min(v1); min.min(v2);
    max.max(v0); max.max(v1); max.max(v2);
    e1.subVectors(v1, v0); e2.subVectors(v2, v0); n.crossVectors(e1, e2); nSum.add(n);
  }

  let uAxis: "x" | "y" | "z", vAxis: "x" | "y" | "z";
  if (nSum.lengthSq() > 1e-12) {
    nSum.normalize();
    const ax = Math.abs(nSum.x), ay = Math.abs(nSum.y), az = Math.abs(nSum.z);
    if (ax >= ay && ax >= az) { uAxis = "y"; vAxis = "z"; }
    else if (ay >= ax && ay >= az) { uAxis = "x"; vAxis = "z"; }
    else { uAxis = "x"; vAxis = "y"; }
  } else {
    const span = new THREE.Vector3().subVectors(max, min);
    const entries = [{ ax: "x" as const, v: span.x }, { ax: "y" as const, v: span.y }, { ax: "z" as const, v: span.z }].sort((a, b) => b.v - a.v);
    uAxis = entries[0].ax; vAxis = entries[1].ax;
  }
  const uMin = (min as any)[uAxis], vMin = (min as any)[vAxis];
  const uSpan = Math.max(1e-6, (max as any)[uAxis] - uMin);
  const vSpan = Math.max(1e-6, (max as any)[vAxis] - vMin);
  const aspect = uSpan / vSpan;

  if (!geom.getAttribute("uv")) geom.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  const uv = geom.getAttribute("uv") as THREE.BufferAttribute;

  used.forEach((vi) => {
    const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
    const obj: Record<"x" | "y" | "z", number> = { x, y, z };
    const U = (obj[uAxis] - uMin) / uSpan;
    const V = 1 - (obj[vAxis] - vMin) / vSpan;
    uv.setXY(vi, U, V);
  });
  uv.needsUpdate = true;
  (geom.attributes as any).uv.needsUpdate = true;
  return aspect;
}

const rig = new THREE.Group();
scene.add(rig);

const TMP = new THREE.Vector3();
let baseRadius = 1;
function coverFraction(): number {
  const w = window.innerWidth, h = window.innerHeight;
  let base = 0.42;
  if (w >= 1350) base = 0.56;
  else if (w >= 981) base = 0.50;
  else if (w >= 641) base = 0.46;
  const heightFactor = THREE.MathUtils.clamp(h / 800, 0.58, 1.0);
  return base * heightFactor;
}
function responsiveScale(): number {
  const rigWorld = rig.getWorldPosition(TMP);
  const d = camera.position.distanceTo(rigWorld);
  const fov = (camera.fov * Math.PI) / 180;
  const s = (coverFraction() * d * Math.tan(fov / 2)) / baseRadius;
  return THREE.MathUtils.clamp(s, 0.32, 3.0);
}

// simple loader
function makeLoader() {
  const style = document.createElement("style");
  style.textContent = `
  #page-loader{position:fixed;inset:0;background:#0b0f14;color:#cfe9ff;display:flex;align-items:center;justify-content:center;z-index:9999;transition:opacity .35s;opacity:1}
  #page-loader.hidden{opacity:0;pointer-events:none}
  .loader-box{width:min(420px,80vw);text-align:center}
  .loader-title{font:600 18px/1.2 system-ui,Inter,Segoe UI,sans-serif;margin-bottom:14px}
  .loader-bar{height:6px;width:100%;background:rgba(255,255,255,.12);border-radius:999px;overflow:hidden}
  .loader-fill{height:100%;width:0%;background:#50bfff;border-radius:999px;transition:width .12s linear}
  .loader-sub{font:400 12px/1.2 system-ui,Inter,Segoe UI,sans-serif;opacity:.7;margin-top:10px}`;
  document.head.appendChild(style);
  const root = document.createElement("div");
  root.id = "page-loader";
  root.innerHTML = `
    <div class="loader-box">
      <div class="loader-title">Loading 3D model…</div>
      <div class="loader-bar"><div class="loader-fill"></div></div>
      <div class="loader-sub" id="loader-sub">Initializing…</div>
    </div>`;
  document.body.appendChild(root);
  const fill = root.querySelector(".loader-fill") as HTMLDivElement;
  const sub = root.querySelector("#loader-sub") as HTMLDivElement;
  return {
    progress(p: number) {
      if (!isFinite(p)) return;
      const pct = Math.max(0, Math.min(100, Math.round(p * 100)));
      fill.style.width = `${pct}%`;
      sub.textContent = pct < 100 ? `Loading… ${pct}%` : `Finalizing…`;
    },
    done() { root.classList.add("hidden"); setTimeout(() => root.remove(), 400); },
    error(msg: string) { sub.textContent = msg || "Failed to load model."; setTimeout(() => this.done(), 1200); },
  };
}
const loaderUI = makeLoader();

/* screen material hookup */
function applyHTMLTextureToScreen(root: THREE.Object3D) {
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material.slice() : [o.material];
    const idx = mats.findIndex((m: any) => (m?.name || "").trim().toLowerCase() === SCREEN_MAT_NAME.toLowerCase());
    if (idx === -1) return;
    const aspect = setUVsForMaterialGroupAndGetAspect(o.geometry as THREE.BufferGeometry, idx);
    resizeScreenCaptureToAspect(aspect);
    const baseMat = mats[idx];
    const m = baseMat.clone();
    m.color = new THREE.Color(0x000000);
    m.map = null;
    m.emissive = new THREE.Color(0xffffff);
    m.emissiveMap = screenTex;
    m.emissiveIntensity = 1.6;
    m.toneMapped = true;
    m.side = THREE.DoubleSide;
    m.needsUpdate = true;
    mats[idx] = m;
    o.material = Array.isArray(o.material) ? mats : mats[0];
    o.castShadow = false;
    o.receiveShadow = false;
  });
}

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

    const sphere = new THREE.Sphere();
    new THREE.Box3().setFromObject(model).getBoundingSphere(sphere);
    baseRadius = sphere.radius || 1;

    applyHTMLTextureToScreen(model);
    rig.add(model);

    sizeToHero();
    loaderUI.done();
    animate();
  },
  (e) => { if (e && e.total) loaderUI.progress(e.loaded / e.total); },
  (err) => { console.error("GLB load error", err); loaderUI.error("Failed to load model."); }
);

// hero pose only
type Pose = {
  pos: THREE.Vector3;
  rot: THREE.Euler;
  scale: number;
  lightPos?: THREE.Vector3;
  shadowOpacity?: number;
  shadowRadius?: number;
};
type Mode = "desktop-xl" | "desktop" | "tablet" | "phone-land" | "phone-port";
const poses: Record<Mode, Pose> = {
  "desktop-xl": { pos: new THREE.Vector3(0, 0.8, 2.0), rot: new THREE.Euler(0,-0.5,0), scale: 1.9,  lightPos: new THREE.Vector3(-1.2,6,4), shadowOpacity:.18, shadowRadius:4 },
  "desktop":    { pos: new THREE.Vector3(1.0, 0.8, 2.0), rot: new THREE.Euler(0,-0.5,0), scale: 1.25, lightPos: new THREE.Vector3(-1.2,6,4), shadowOpacity:.18, shadowRadius:4 },
  "tablet":     { pos: new THREE.Vector3(0,.3,2.9),      rot: new THREE.Euler(0,0,0),     scale: 1.95, lightPos: new THREE.Vector3(-1.0,5.8,3.6), shadowOpacity:0, shadowRadius:4 },
  "phone-land": { pos: new THREE.Vector3(0.5,0.7,2.5),   rot: new THREE.Euler(0,-0.35,0), scale: 0, lightPos: new THREE.Vector3(-0.9,5.4,3.0), shadowOpacity:.14, shadowRadius:4 },
  "phone-port": { pos: new THREE.Vector3(0,.3,2.9),      rot: new THREE.Euler(0,0,0),     scale: 1.4,  lightPos: new THREE.Vector3(-0.9,5.0,2.6), shadowOpacity:.12, shadowRadius:4 },
};

function getMode(): Mode {
  const w = window.innerWidth;
  const portrait = window.matchMedia("(orientation: portrait)").matches;

  if (w >= 1500) return "desktop-xl";
  if (w >= 1100) return "tablet";             
  if (w >= 641)  return portrait ? "phone-port" : "tablet";
  return portrait ? "phone-port" : "phone-land";
}
let mode: Mode = getMode();
let pose: Pose = poses[mode];
function applyModeIfNeeded() {
  const m = getMode();
  if (m !== mode) { mode = m; pose = poses[mode]; }
}
window.addEventListener("resize", applyModeIfNeeded);
window.addEventListener("orientationchange", () => setTimeout(applyModeIfNeeded, 50));

const DEFAULT_LIGHT_POS = dir.position.clone();
const DEFAULT_SHADOW_OPACITY = (ground.material as THREE.ShadowMaterial).opacity;
const DEFAULT_SHADOW_RADIUS = dir.shadow.radius;

// animate
function animate() {
  const now = performance.now();
  if (screenRoot && h2c && now - lastCapture > 1000 / SCREEN_FPS) {
    lastCapture = now;
    captureHTMLToCanvas();
  }

  const EASE = 0.18;

  rig.position.lerp(pose.pos, EASE);

  mouse.x += (targetMouse.x - mouse.x) * TILT_EASE;
  mouse.y += (targetMouse.y - mouse.y) * TILT_EASE;
  const yaw = -mouse.x * MAX_YAW, pitch = mouse.y * MAX_PITCH;

  const baseQ = new THREE.Quaternion().setFromEuler(pose.rot);
  const tiltQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0));
  rig.quaternion.slerp(baseQ.multiply(tiltQ), EASE);

  const targetS = pose.scale * responsiveScale();
  rig.scale.x += (targetS - rig.scale.x) * EASE;
  rig.scale.y += (targetS - rig.scale.y) * EASE;
  rig.scale.z += (targetS - rig.scale.z) * EASE;

  const lp = pose.lightPos ?? DEFAULT_LIGHT_POS;
  dir.position.lerp(lp, EASE);
  const sm = ground.material as THREE.ShadowMaterial;
  const to = pose.shadowOpacity ?? DEFAULT_SHADOW_OPACITY;
  sm.opacity += (to - sm.opacity) * EASE;
  const tr = pose.shadowRadius ?? DEFAULT_SHADOW_RADIUS;
  dir.shadow.radius += (tr - dir.shadow.radius) * 0.25;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

initFeaturePods();
initPromoAndBand();


