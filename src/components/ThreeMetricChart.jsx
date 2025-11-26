import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const BAR_COUNT = 20;
const BAR_SPACING = 0.5;
const BAR_WIDTH = 0.35;
const HEIGHT_SCALE = 0.03;
const AXIS_TICKS = [0, 25, 50, 75, 100];

function ThreeMetricChart({ data = [], color = "#60a5fa", interactive = true }) {
  const wrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const tooltipRef = useRef(null);
  const chartRef = useRef(null);
  const axisRefs = useRef([]);
  const dummy = useRef(new THREE.Object3D());
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const hoverIndexRef = useRef(null);
  const pointerPosRef = useRef({ x: 0, y: 0 });
  const valuesRef = useRef(new Array(BAR_COUNT).fill(0));
  const initialColorRef = useRef(color);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvasHost = canvasRef.current;
    if (!wrapper || !canvasHost) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b172a);

    const width = wrapper.clientWidth || 400;
    const height = wrapper.clientHeight || 300;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(2.6, 3.2, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(width, height, false);
    canvasHost.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 2.2;
    controls.maxDistance = 7;
    controls.minPolarAngle = Math.PI / 6;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minAzimuthAngle = -Math.PI / 6;
    controls.maxAzimuthAngle = Math.PI / 3;
    controls.target.set(0, 0.9, 0);
    controls.update();

    const ambient = new THREE.AmbientLight(0xffffff, 0.72);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1);
    keyLight.position.set(4, 6, 6);
    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.45);
    rimLight.position.set(-4, 4, -6);

    scene.add(ambient, keyLight, rimLight);

    const grid = new THREE.GridHelper(12, 12, 0x1f2937, 0x1f2937);
    grid.position.y = -0.5;
    scene.add(grid);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: initialColorRef.current,
      metalness: 0.25,
      roughness: 0.6,
      emissive: 0x0b1a2c,
    });

    const instancedMesh = new THREE.InstancedMesh(
      geometry,
      material,
      BAR_COUNT
    );
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(BAR_COUNT * 3),
      3
    );
    scene.add(instancedMesh);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(BAR_COUNT * BAR_SPACING + 0.6, 0.06, 2),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0.85,
      })
    );
    base.position.set(0, -0.5, 0);
    scene.add(base);

    const axisVector = new THREE.Vector3();
    const updateAxes = () => {
      const host = wrapperRef.current;
      if (!host) return;
      const wrapperHeight = host.clientHeight || height;

      AXIS_TICKS.forEach((tick, idx) => {
        const lineEl = axisRefs.current[idx];
        if (!lineEl) return;

        const yWorld =
          tick === 0 ? -0.5 : -0.5 + tick * HEIGHT_SCALE + 0.05;
        axisVector.set(0, yWorld, 0).project(camera);
        const topPx = ((-axisVector.y + 1) / 2) * wrapperHeight;
        const clamped = Math.min(Math.max(topPx, 0), wrapperHeight);
        lineEl.style.top = `${clamped}px`;
      });
    };

    const resize = () => {
      const w = wrapper.clientWidth || width;
      const h = wrapper.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      updateAxes();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(wrapper);

    const baseColor = new THREE.Color(initialColorRef.current);
    const highlightColor = baseColor.clone();
    highlightColor.offsetHSL(0, 0, 0.18);
    for (let i = 0; i < BAR_COUNT; i += 1) {
      instancedMesh.setColorAt(i, baseColor);
    }
    instancedMesh.instanceColor.needsUpdate = true;

    const state = {
      scene,
      camera,
      renderer,
      controls,
      instancedMesh,
      resizeObserver,
      animationId: 0,
      baseColor,
      highlightColor,
      updateAxes,
    };

    chartRef.current = state;
    updateAxes();

    const renderLoop = () => {
      controls.update();
      updateAxes();
      renderer.render(scene, camera);
      state.animationId = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    return () => {
      cancelAnimationFrame(state.animationId);
      resizeObserver.disconnect();
      controls.dispose();
      instancedMesh.geometry.dispose();
      instancedMesh.material.dispose();
      renderer.dispose();
      canvasHost.replaceChildren();
      scene.clear();
      chartRef.current = null;
    };
  }, []);

  const applyHover = useCallback((index) => {
    const state = chartRef.current;
    if (!state) return;

    const { instancedMesh, baseColor, highlightColor } = state;
    const activeColor = highlightColor ?? baseColor;
    const previous = hoverIndexRef.current;

    if (previous !== null && previous !== undefined) {
      instancedMesh.setColorAt(previous, baseColor);
    }

    if (index !== null && index !== undefined && index >= 0) {
      instancedMesh.setColorAt(index, activeColor);
      hoverIndexRef.current = index;
    } else {
      hoverIndexRef.current = null;
    }

    instancedMesh.instanceColor.needsUpdate = true;
  }, []);

  const updateTooltip = useCallback(
    (index, pointer) => {
      const tooltip = tooltipRef.current;
      const wrapper = wrapperRef.current;
      if (!tooltip || !wrapper) return;

      if (
        !interactive ||
        index === null ||
        index === undefined ||
        index < 0 ||
        index >= BAR_COUNT
      ) {
        tooltip.style.opacity = "0";
        return;
      }

      const values = valuesRef.current;
      const value = Math.round(values[index] ?? 0);
      tooltip.textContent = `${value}%`;

      const x = Math.min(Math.max(pointer.x, 8), wrapper.clientWidth - 8);
      const y = Math.min(Math.max(pointer.y, 8), wrapper.clientHeight - 8);
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
      tooltip.style.opacity = "1";
    },
    [interactive]
  );

  useEffect(() => {
    if (!chartRef.current) return;
    const instancedMesh = chartRef.current.instancedMesh;
    if (!instancedMesh) return;

    const values = data
      .slice(-BAR_COUNT)
      .map((value) => (Number.isFinite(value) ? value : 0));
    const padded = new Array(BAR_COUNT).fill(0);
    const start = Math.max(BAR_COUNT - values.length, 0);
    values.forEach((value, index) => {
      padded[start + index] = value;
    });

    valuesRef.current = padded;

    const offset = ((BAR_COUNT - 1) * BAR_SPACING) / 2;
    const xShift = (start * BAR_SPACING) / 2;

    padded.forEach((value, index) => {
      const height = Math.max(value, 0) * HEIGHT_SCALE + 0.05;
      dummy.current.position.set(
        index * BAR_SPACING - offset - xShift,
        height / 2 - 0.5,
        0
      );
      dummy.current.scale.set(BAR_WIDTH, height, 0.6);
      dummy.current.updateMatrix();
      instancedMesh.setMatrixAt(index, dummy.current.matrix);
    });
    instancedMesh.instanceMatrix.needsUpdate = true;

    if (hoverIndexRef.current !== null && hoverIndexRef.current !== undefined) {
      updateTooltip(hoverIndexRef.current, pointerPosRef.current);
    }
  }, [data, updateTooltip]);

  useEffect(() => {
    const state = chartRef.current;
    if (!state) return;

    const baseColor = new THREE.Color(color);
    const highlightColor = baseColor.clone();
    highlightColor.offsetHSL(0, 0, 0.18);

    state.baseColor = baseColor;
    state.highlightColor = highlightColor;

    for (let i = 0; i < BAR_COUNT; i += 1) {
      state.instancedMesh.setColorAt(i, baseColor);
    }
    state.instancedMesh.instanceColor.needsUpdate = true;
    applyHover(null);
  }, [applyHover, color]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;

    wrapper.style.cursor = interactive ? "grab" : "default";

    const handlePointerMove = (event) => {
      if (!interactive) return;
      const state = chartRef.current;
      if (!state) return;

      const rect = wrapper.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      pointerPosRef.current = { x: localX, y: localY };

      pointerRef.current.x = (localX / rect.width) * 2 - 1;
      pointerRef.current.y = -(localY / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(pointerRef.current, state.camera);
      const intersections = raycasterRef.current.intersectObject(
        state.instancedMesh
      );

      if (intersections.length && intersections[0].instanceId != null) {
        const index = intersections[0].instanceId;
        if (hoverIndexRef.current !== index) {
          applyHover(index);
        }
        updateTooltip(index, pointerPosRef.current);
      } else if (hoverIndexRef.current !== null) {
        applyHover(null);
        updateTooltip(null, pointerPosRef.current);
      }
    };

    const handlePointerLeave = () => {
      applyHover(null);
      updateTooltip(null, pointerPosRef.current);
    };

    if (interactive) {
      wrapper.addEventListener("pointermove", handlePointerMove);
      wrapper.addEventListener("pointerleave", handlePointerLeave);
    } else {
      applyHover(null);
      updateTooltip(null, pointerPosRef.current);
    }

    return () => {
      wrapper.removeEventListener("pointermove", handlePointerMove);
      wrapper.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [applyHover, interactive, updateTooltip]);

  axisRefs.current.length = AXIS_TICKS.length;

  return (
    <div
      className={`three-chart${interactive ? "" : " disabled"}`}
      ref={wrapperRef}
    >
      <div className="three-overlay">
        {AXIS_TICKS.map((tick, index) => (
          <div
            key={tick}
            className="three-overlay-line"
            ref={(el) => {
              axisRefs.current[index] = el;
            }}
          >
            <span>{tick}%</span>
          </div>
        ))}
      </div>
      <div className="three-canvas" ref={canvasRef} />
      <div className="three-tooltip" ref={tooltipRef} />
    </div>
  );
}

export default ThreeMetricChart;
