<template>
  <div class="board-3d-viewer" aria-label="Interactive 3D board view">
    <div ref="mount" class="board-3d-canvas"></div>
    <div v-if="fallback" class="board-3d-fallback">3D preview is unavailable in this browser. Use the connector tabs above.</div>
    <div v-if="loaded" class="board-3d-pins">
      <button v-for="(pin, index) in pins" :key="pin.id" :ref="el => pinElements[index] = el"
        type="button" class="board-3d-pin" :class="{ active: active === pin.id }"
        :aria-label="pin.label" :aria-pressed="active === pin.id"
        @click="$emit('select', pin.id)"><span>{{ pin.number }}</span></button>
    </div>
    <div class="board-3d-hint">DRAG TO ROTATE <span>·</span> SCROLL TO ZOOM</div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import boardModel from "../assets/proshock-board.glb?url";

const props = defineProps({ active: String, panelSide: { type: String, default: "right" } });
const emit = defineEmits(["select", "pin-position"]);
const mount = ref(null);
const fallback = ref(false);
const loaded = ref(false);
const pinElements = [];
const pins = [
  { id: "six", number: "01", label: "6-pin expansion connector FPC4", x: 924, y: 247, z: -3.5 },
  { id: "daughter", number: "02", label: "Expansion button connector FPC3", x: 1265, y: 510, z: -5.0 },
  { id: "u18", number: "03", label: "U18 onboard expansion", x: 710, y: 747, z: -1.6 },
  { id: "wide", number: "04", label: "16-pin ribbon FPC2", x: 1114, y: 247, z: -3.5 },
  { id: "pads", number: "05", label: "K1 through K8 pads", x: 76, y: 810, z: -1.6 },
];
let cleanup = () => {};

/** @brief Mount the JLC OBJ export converted to a compact, browser-ready GLB. */
onMounted(async () => {
  const host = mount.value;
  if (!host) return;
  let alive = true;
  cleanup = () => { alive = false; };
  try {
    const [THREE, { OrbitControls }, { GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
      import("three"), import("three/addons/controls/OrbitControls.js"),
      import("three/addons/loaders/GLTFLoader.js"), import("three/addons/libs/meshopt_decoder.module.js"),
    ]);
    if (!alive) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    camera.position.set(6, -18, -72);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 57;
    controls.maxDistance = 140;
    controls.minPolarAngle = 0.65;
    controls.maxPolarAngle = 2.35;
    controls.target.set(0, 0, 0);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    const key = new THREE.DirectionalLight(0xbadfff, 3.1);
    key.position.set(-30, 45, 60);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x5ccfff, 1.5);
    rim.position.set(50, -30, -15);
    scene.add(rim);

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(boardModel);
    if (!alive) { renderer.dispose(); return; }
    const board = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(board);
    const center = bounds.getCenter(new THREE.Vector3());
    board.position.sub(center);
    const pivot = new THREE.Group();
    pivot.add(board);
    scene.add(pivot);
    // Match connector callouts to the back-side view; the displayed geometry
    // comes only from the approved JLC model, not from the reference photo.
    const point = (x, y, z) => [
      bounds.max.x - (x - 42) / 1363 * (bounds.max.x - bounds.min.x) - center.x,
      bounds.max.y - (y - 139) / 850 * (bounds.max.y - bounds.min.y) - center.y,
      z - center.z,
    ];

    const size = { width: 0, height: 0 };
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      size.width = Math.max(1, width);
      size.height = Math.max(1, height);
      camera.aspect = size.width / size.height;
      camera.updateProjectionMatrix();
      renderer.setSize(size.width, size.height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    loaded.value = true;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const projected = new THREE.Vector3();
    let frame = 0;
    let shifted = 0;
    let turned = 0;
    let lastReported = 0;
    const render = (time) => {
      controls.update();
      // Back-side camera reverses screen X, so move toward positive model X
      // when the detail panel opens on the right.
      const targetShift = props.active ? (props.panelSide === "left" ? -14 : 14) : 0;
      const targetTurn = props.active ? (props.panelSide === "left" ? -0.35 : 0.35) : 0;
      shifted = reducedMotion ? targetShift : shifted + (targetShift - shifted) * 0.085;
      turned = reducedMotion ? targetTurn : turned + (targetTurn - turned) * 0.085;
      pivot.position.x = shifted;
      pivot.position.y = reducedMotion ? 0 : 0.45 * Math.sin(time * 0.0011);
      pivot.rotation.y = turned;
      if (!reducedMotion) {
        pivot.rotation.y += 0.025 * Math.sin(time * 0.00045);
        pivot.rotation.x = 0.012 * Math.sin(time * 0.00032);
      }
      renderer.render(scene, camera);
      pins.forEach((pin, index) => {
        const element = pinElements[index];
        if (!element) return;
        projected.set(...point(pin.x, pin.y, pin.z)).applyEuler(pivot.rotation).add(pivot.position).project(camera);
        element.style.left = `${(projected.x + 1) * size.width / 2}px`;
        element.style.top = `${(1 - projected.y) * size.height / 2}px`;
        element.style.visibility = camera.position.z < -25 && projected.z < 1 && projected.z > -1 ? "visible" : "hidden";
        if (pin.id === props.active && time - lastReported > 30) {
          lastReported = time;
          emit("pin-position", { x: (projected.x + 1) * size.width / 2, y: (1 - projected.y) * size.height / 2 });
        }
      });
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    cleanup = () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      board.traverse((part) => {
        part.geometry?.dispose();
        if (Array.isArray(part.material)) part.material.forEach((material) => material.dispose());
        else part.material?.dispose();
      });
      renderer.domElement.remove();
    };
  } catch {
    fallback.value = true;
  }
});
onBeforeUnmount(() => cleanup());
</script>

<style scoped>
.board-3d-viewer { position: relative; width: 100%; min-height: 510px; overflow: hidden; background: radial-gradient(ellipse at 48% 49%, #21313b 0, #0d151c 57%, #080d12 100%); }
.board-3d-viewer::after { content: ""; position: absolute; inset: auto 13% 7% 13%; height: 16%; border-radius: 50%; background: #000; opacity: .4; filter: blur(35px); pointer-events: none; }
.board-3d-canvas { position: absolute; inset: 0; z-index: 1; }
.board-3d-canvas :deep(canvas) { width: 100%; height: 100%; display: block; cursor: grab; }
.board-3d-canvas :deep(canvas:active) { cursor: grabbing; }
.board-3d-pins { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.board-3d-pin { position: absolute; width: 34px; height: 34px; min-height: 0; padding: 0; border: 1px solid #a6edff; border-radius: 50%; background: rgba(5,15,22,.84); color: #c2f5ff; box-shadow: 0 0 0 5px rgba(85,214,255,.11), 0 0 20px rgba(85,214,255,.55); font: 700 10px var(--font-mono); pointer-events: auto; transform: translate(-50%, -50%); }
.board-3d-pin.active { background: var(--accent); color: #071219; box-shadow: 0 0 0 7px rgba(85,214,255,.19), 0 0 30px rgba(85,214,255,.8); }
.board-3d-pin:hover { transform: translate(-50%, -50%) scale(1.12); }
.board-3d-hint { position: absolute; left: 20px; bottom: 17px; z-index: 3; color: #95abba; font: 10px var(--font-mono); letter-spacing: .08em; pointer-events: none; }
.board-3d-hint span { margin: 0 6px; color: var(--accent); }
.board-3d-fallback { position: relative; z-index: 1; display: grid; place-items: center; min-height: 510px; padding: 24px; color: var(--secondary); font-size: 12px; text-align: center; }
@media (max-width: 700px) { .board-3d-viewer { min-height: 370px; } .board-3d-hint { font-size: 8px; } }
@media (prefers-reduced-motion: reduce) { .board-3d-pin { transition: none; } }
</style>
