import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { heightmapStatistics } from '../core/heightmap.js';
import { clamp } from '../core/math.js';

// Linear-space vertex colors; no textures, terrain shaders, or postprocessing.
const COLOR_STOPS = [
  [0.00, [0.12, 0.19, 0.12]], [0.28, [0.25, 0.33, 0.17]],
  [0.55, [0.43, 0.38, 0.24]], [0.80, [0.56, 0.53, 0.45]], [1.00, [0.82, 0.82, 0.79]],
];

function heightColor(t, output, offset) {
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    if (t <= COLOR_STOPS[i][0]) {
      const [low, a] = COLOR_STOPS[i - 1], [high, b] = COLOR_STOPS[i];
      const mix = (t - low) / (high - low);
      for (let component = 0; component < 3; component++) output[offset + component] = a[component] + mix * (b[component] - a[component]);
      return;
    }
  }
}

export class TerrainViewport {
  constructor(container, mapCanvas) {
    this.container = container;
    this.mapCanvas = mapCanvas;
    this.mapView = mapCanvas.parentElement;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f5f5);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive three-dimensional terrain');
    this.container.prepend(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener('change', () => this.render());
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(-200, 350, 150); this.scene.add(sun);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.unlitMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.mesh = null;
    this.mode = 'terrain';
    this.wireframe = false;
    this.map = null;
    this.base = null;
    this.baseRange = { minimum: 0, maximum: 1 };
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      container.dispatchEvent(new CustomEvent('viewport-error', { detail: 'WebGL context was lost. Try a lower resolution or reload.' }));
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => this.render());
    this.resize();
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false); this.render();
  }

  update(map, base, { newBase = false, frame = false } = {}) {
    this.map = map; this.base = base;
    if (newBase) this.baseRange = heightmapStatistics(base);
    if (!this.mesh || this.mesh.geometry.attributes.position.count !== map.data.length) {
      if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
      const geometry = new THREE.PlaneGeometry(map.size, map.size, map.width - 1, map.height - 1);
      geometry.rotateX(-Math.PI / 2);
      geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(map.data.length * 3), 3));
      this.mesh = new THREE.Mesh(geometry, this.material);
      this.scene.add(this.mesh);
    }
    const geometry = this.mesh.geometry, positions = geometry.attributes.position.array;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const i = y * map.width + x;
        positions[i * 3] = x * map.cellSize - map.size / 2;
        positions[i * 3 + 1] = map.data[i];
        positions[i * 3 + 2] = y * map.cellSize - map.size / 2;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    this.updateColors(); this.drawHeightmap();
    if (frame) this.frameTerrain();
    this.render();
  }

  updateColors() {
    if (!this.map) return;
    const colors = this.mesh.geometry.attributes.color.array;
    const { minimum, maximum } = this.baseRange;
    const range = Math.max(1e-8, maximum - minimum);
    let differenceRange = 0;
    if (this.mode === 'difference') {
      for (let i = 0; i < this.map.data.length; i++) differenceRange = Math.max(differenceRange, Math.abs(this.map.data[i] - this.base.data[i]));
    }
    this.differenceRange = differenceRange;
    for (let i = 0; i < this.map.data.length; i++) {
      const t = clamp((this.map.data[i] - minimum) / range, 0, 1), offset = i * 3;
      if (this.mode === 'neutral') colors.fill(0.48, offset, offset + 3);
      else if (this.mode === 'grayscale') {
        // Store linear intensity that displays as the desired grayscale value.
        const linear = t <= 0.04045 ? t / 12.92 : ((t + 0.055) / 1.055) ** 2.4;
        colors.fill(linear, offset, offset + 3);
      } else if (this.mode === 'difference') {
        const value = differenceRange > 0 ? (this.map.data[i] - this.base.data[i]) / differenceRange : 0;
        const amount = Math.abs(value);
        colors[offset] = value < 0 ? 0.75 - amount * 0.68 : 0.75;
        colors[offset + 1] = 0.75 - amount * 0.63;
        colors[offset + 2] = value > 0 ? 0.75 - amount * 0.68 : 0.75;
      } else heightColor(t, colors, offset);
    }
    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.mesh.material = this.mode === 'grayscale' || this.mode === 'difference' ? this.unlitMaterial : this.material;
    this.material.wireframe = this.wireframe; this.unlitMaterial.wireframe = this.wireframe;
  }

  drawHeightmap() {
    if (!this.map) return;
    const canvas = this.mapCanvas;
    canvas.width = this.map.width; canvas.height = this.map.height;
    const context = canvas.getContext('2d');
    const image = context.createImageData(canvas.width, canvas.height);
    const range = Math.max(1e-8, this.baseRange.maximum - this.baseRange.minimum);
    for (let i = 0; i < this.map.data.length; i++) {
      const value = Math.round(clamp((this.map.data[i] - this.baseRange.minimum) / range, 0, 1) * 255);
      image.data[i * 4] = value; image.data[i * 4 + 1] = value; image.data[i * 4 + 2] = value; image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  setMode(mode) {
    this.mode = mode;
    this.mapView.hidden = mode !== 'heightmap';
    this.renderer.domElement.hidden = mode === 'heightmap';
    this.updateColors(); this.render();
  }

  setWireframe(enabled) {
    this.wireframe = enabled; this.material.wireframe = enabled; this.unlitMaterial.wireframe = enabled; this.render();
  }

  frameTerrain() {
    if (!this.map) return;
    const stats = heightmapStatistics(this.map), size = this.map.size;
    const middle = (stats.minimum + stats.maximum) / 2;
    const radius = Math.hypot(size * 0.5, size * 0.5, (stats.maximum - stats.minimum) * 0.5);
    const halfFov = Math.min(this.camera.fov * Math.PI / 360,
      Math.atan(Math.tan(this.camera.fov * Math.PI / 360) * this.camera.aspect));
    const distance = radius / Math.sin(halfFov) * 1.05;
    const direction = new THREE.Vector3(0.9, 0.75, 1.15).normalize();
    this.controls.target.set(0, middle, 0);
    this.camera.position.copy(this.controls.target).addScaledVector(direction, distance);
    this.camera.near = Math.max(0.1, size / 2000); this.camera.far = Math.max(10000, distance * 30);
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = size * 0.025; this.controls.maxDistance = distance * 6;
    this.controls.update(); this.render();
  }

  render() {
    if (this.renderer && this.mode !== 'heightmap') this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resizeObserver.disconnect(); this.controls.dispose(); this.mesh?.geometry.dispose();
    this.material.dispose(); this.unlitMaterial.dispose(); this.renderer.dispose();
  }
}
