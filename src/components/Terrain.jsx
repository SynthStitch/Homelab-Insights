import { useEffect, useRef } from "react";

/**
 * Wireframe terrain for the Oblivion atmosphere: a heightfield drawn as thin
 * horizontal polylines with dots at the vertices, slowly breathing.
 * ponytail: layered sines instead of real noise; 2D canvas, no three.js.
 */
const COLS = 110;
const ROWS = 34;

export default function Terrain({ color = "#e3e8ee" }) {
  const ref = useRef(null);
  const colorRef = useRef(color);
  colorRef.current = color;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let running = true;
    let w = 0;
    let h = 0;
    let t = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    window.addEventListener("resize", resize);
    resize();

    const height = (x, z, time) =>
      Math.sin(x * 1.7 + time) * 0.35 +
      Math.sin(x * 0.6 - z * 1.1 + time * 0.7) * 0.5 +
      Math.cos(z * 2.3 + x * 0.8 - time * 0.4) * 0.22 +
      Math.sin((x + z) * 4.1 + time * 1.3) * 0.06;

    const draw = () => {
      if (!running) return;
      t += 0.0035;
      ctx.clearRect(0, 0, w, h);
      const c = colorRef.current;
      const horizon = h * 0.42;
      const depth = h * 0.62;
      const amp = h * 0.22;

      for (let r = 0; r < ROWS; r++) {
        const z = r / (ROWS - 1);
        const persp = 0.35 + z * 0.65; // rows near the viewer spread wider
        const y0 = horizon + z * depth;
        const alpha = 0.06 + z * 0.16;
        ctx.beginPath();
        for (let cIdx = 0; cIdx <= COLS; cIdx++) {
          const u = cIdx / COLS;
          const x = w / 2 + (u - 0.5) * w * 1.25 * persp;
          const yh = height(u * 6, z * 4, t) * amp * persp;
          const y = y0 - yh;
          if (cIdx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = c;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 0.6;
        ctx.stroke();

        // dot matrix on every third row, brighter on ridges
        if (r % 3 === 0) {
          for (let cIdx = 0; cIdx <= COLS; cIdx += 2) {
            const u = cIdx / COLS;
            const x = w / 2 + (u - 0.5) * w * 1.25 * persp;
            const hv = height(u * 6, z * 4, t);
            const y = y0 - hv * amp * persp;
            ctx.globalAlpha = Math.min(0.9, alpha + Math.max(0, hv) * 0.5);
            ctx.fillStyle = c;
            ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
          }
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    const onVis = () => {
      running = !document.hidden;
      if (running) raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className="atmo__terrain" aria-hidden="true" />;
}
