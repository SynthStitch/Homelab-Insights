import { useEffect, useRef } from "react";
import * as THREE from "three";

const defaultOptions = {
  bodyClass: undefined,
  clearColor: 0x050713,
  waveAmplitude: 0.9,
  waveSpeed: 0.7,
  gridSize: 60,
  gridSegments: 48,
  lineColor: 0x60a5fa,
  lineOpacity: 0.45,
  pixelRatio: 1.4,
  maxFPS: 30,
  mode: "auto", // auto | three | static
  fallbackBodyClass: "wireframe-static-bg",
  lowPowerCpuCores: 4,
  lowPowerDeviceMemory: 4,
};

export function useWireframeBackground(customOptions = {}) {
  const options = { ...defaultOptions, ...customOptions };
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return () => {};

    let fallbackApplied = false;
    const applyFallback = () => {
      if (fallbackApplied) return;
      fallbackApplied = true;
      canvas.style.display = "none";
      if (options.fallbackBodyClass) {
        document.body.classList.add(options.fallbackBodyClass);
      }
    };

    const clearFallback = () => {
      if (!fallbackApplied) return;
      fallbackApplied = false;
      canvas.style.removeProperty("display");
      if (options.fallbackBodyClass) {
        document.body.classList.remove(options.fallbackBodyClass);
      }
    };

    if (options.bodyClass) {
      document.body.classList.add(options.bodyClass);
    }

    const prefersReducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    const lowPowerCpu =
      options.mode !== "three" &&
      options.lowPowerCpuCores != null &&
      typeof navigator !== "undefined" &&
      typeof navigator.hardwareConcurrency === "number" &&
      navigator.hardwareConcurrency <= options.lowPowerCpuCores;
    const lowPowerMemory =
      options.mode !== "three" &&
      options.lowPowerDeviceMemory != null &&
      typeof navigator !== "undefined" &&
      typeof navigator.deviceMemory === "number" &&
      navigator.deviceMemory <= options.lowPowerDeviceMemory;
    const prefersSaveData =
      options.mode !== "three" &&
      typeof navigator !== "undefined" &&
      navigator.connection &&
      navigator.connection.saveData === true;

    if (
      options.mode === "static" ||
      (options.mode === "auto" &&
        (prefersReducedMotionQuery.matches ||
          lowPowerCpu ||
          lowPowerMemory ||
          prefersSaveData))
    ) {
      applyFallback();
      return () => {
        if (options.bodyClass) {
          document.body.classList.remove(options.bodyClass);
        }
        clearFallback();
      };
    }

    clearFallback();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(0, 12, 16);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    const setPixelRatio = () =>
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, options.pixelRatio)
      );
    setPixelRatio();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(options.clearColor, 1);

    const geometry = new THREE.PlaneGeometry(
      options.gridSize,
      options.gridSize,
      options.gridSegments,
      options.gridSegments
    );
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshBasicMaterial({
      color: options.lineColor,
      wireframe: true,
      transparent: true,
      opacity: options.lineOpacity,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = -2;
    scene.add(mesh);

    const originalPositions = geometry.attributes.position.array.slice();
    const clock = new THREE.Clock();
    let animationId = 0;
    let running = true;
    let lastFrame = 0;
    let currentAmplitude = options.waveAmplitude;
    let currentSpeed = options.waveSpeed;
    let currentMaxFPS = options.maxFPS;
    let visible = true;
    const frameSamples = [];
    let flattened = false;

    const applyMotionPreferences = (reduceMotion) => {
      if (reduceMotion) {
        currentAmplitude = options.waveAmplitude * 0.25;
        currentSpeed = options.waveSpeed * 0.5;
        currentMaxFPS = Math.min(options.maxFPS, 18);
      } else {
        currentAmplitude = options.waveAmplitude;
        currentSpeed = options.waveSpeed;
        currentMaxFPS = options.maxFPS;
      }
      if (currentAmplitude === 0) {
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
          positions[i + 1] = originalPositions[i + 1];
        }
        geometry.attributes.position.needsUpdate = true;
        flattened = true;
      }
    };

    applyMotionPreferences(prefersReducedMotionQuery.matches);

    function handleMotionChange(event) {
      if (event.matches && options.mode !== "three") {
        switchToFallback();
        return;
      }
      applyMotionPreferences(event.matches);
    }

    const addMotionListener =
      typeof prefersReducedMotionQuery.addEventListener === "function"
        ? () =>
            prefersReducedMotionQuery.addEventListener(
              "change",
              handleMotionChange
            )
        : () =>
            prefersReducedMotionQuery.addListener &&
            prefersReducedMotionQuery.addListener(handleMotionChange);

    const removeMotionListener =
      typeof prefersReducedMotionQuery.removeEventListener === "function"
        ? () =>
            prefersReducedMotionQuery.removeEventListener(
              "change",
              handleMotionChange
            )
        : () =>
            prefersReducedMotionQuery.removeListener &&
            prefersReducedMotionQuery.removeListener(handleMotionChange);

    addMotionListener();

    function handleVisibility() {
      visible = document.visibilityState !== "hidden";
      if (visible) {
        lastFrame = 0;
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);

    function handleResize() {
      const { innerWidth, innerHeight } = window;
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight, false);
      setPixelRatio();
    }

    window.addEventListener("resize", handleResize);

    function cleanupResources() {
      if (!running) return;
      running = false;
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibility);
      removeMotionListener();
      cancelAnimationFrame(animationId);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    }

    function switchToFallback() {
      cleanupResources();
      applyFallback();
    }

    const animate = () => {
      if (!running) return;
      animationId = requestAnimationFrame(animate);
      if (!visible) return;

      const now = performance.now();
      if (now - lastFrame < 1000 / currentMaxFPS) return;
      const delta = now - lastFrame;
      lastFrame = now;

      frameSamples.push(delta);
      if (frameSamples.length > 48) frameSamples.shift();
      if (
        options.mode !== "three" &&
        frameSamples.length === 48 &&
        frameSamples.reduce((acc, value) => acc + value, 0) / frameSamples.length >
          1000 / Math.max(12, options.maxFPS - 6)
      ) {
        switchToFallback();
        return;
      }

      const time = clock.getElapsedTime() * currentSpeed;
      const positions = geometry.attributes.position.array;

      if (currentAmplitude > 0.0001) {
        flattened = false;
        for (let i = 0; i < positions.length; i += 3) {
          const ox = originalPositions[i];
          const oz = originalPositions[i + 2];
          const wave =
            Math.sin(ox * 0.6 + time) + Math.cos(oz * 0.4 + time * 0.8);
          positions[i + 1] =
            originalPositions[i + 1] + wave * 0.4 * currentAmplitude;
        }
        geometry.attributes.position.needsUpdate = true;
      } else if (!flattened) {
        for (let i = 0; i < positions.length; i += 3) {
          positions[i + 1] = originalPositions[i + 1];
        }
        geometry.attributes.position.needsUpdate = true;
        flattened = true;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cleanupResources();
      if (options.bodyClass) {
        document.body.classList.remove(options.bodyClass);
      }
      clearFallback();
    };
  }, [
    options.bodyClass,
    options.clearColor,
    options.gridSize,
    options.gridSegments,
    options.waveAmplitude,
    options.waveSpeed,
    options.lineColor,
    options.lineOpacity,
    options.pixelRatio,
    options.maxFPS,
    options.mode,
    options.fallbackBodyClass,
    options.lowPowerCpuCores,
    options.lowPowerDeviceMemory,
  ]);

  return canvasRef;
}
