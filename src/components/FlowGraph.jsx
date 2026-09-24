import { useEffect, useRef } from "react";
import { useChartTheme } from "../context/ThemeContext.jsx";

/**
 * FlowGraph: guests as dashed bezier paths converging on their host.
 * Particles stream along each path; count and speed follow live CPU.
 * Ported from a 21st.dev "gateway flow" canvas, made data-driven and theme-aware.
 *
 * props:
 *   items:    [{ key, name, status, cpu (0..1), color }]
 *   hotKey / selectedKey: highlight state
 *   onHover(key|null), onSelect(key)
 *   label:    center label (node name)
 */
export default function FlowGraph({ items = [], hotKey, selectedKey, onHover, onSelect, label = "" }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const ct = useChartTheme();
  // Mutable scene state lives in refs so the rAF loop never restarts on re-render.
  const state = useRef({ items: [], paths: [], pulses: [], hot: null, sel: null, ct, label, w: 0, h: 0 });

  state.current.items = items;
  state.current.hot = hotKey ?? null;
  state.current.sel = selectedKey ?? null;
  state.current.ct = ct;
  state.current.label = label;

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const s = state.current;
    let raf = 0;
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      s.w = host.clientWidth;
      s.h = host.clientHeight;
      canvas.width = s.w * dpr;
      canvas.height = s.h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // Path geometry: alternate sides, spread vertically, all ending at the center.
    const geometry = () => {
      const { w, h } = s;
      const cx = w / 2;
      const cy = h / 2;
      const left = s.items.filter((_, i) => i % 2 === 0);
      const right = s.items.filter((_, i) => i % 2 === 1);
      const place = (list, isLeft) =>
        list.map((item, i) => {
          const y = ((i + 1) / (list.length + 1)) * h * 0.9 + h * 0.05;
          const p0 = { x: isLeft ? 0 : w, y };
          const p1 = { x: isLeft ? cx * 0.45 : w - cx * 0.45, y };
          const p2 = { x: isLeft ? cx * 0.8 : w - cx * 0.8, y: cy };
          return { item, isLeft, p0, p1, p2, p3: { x: cx, y: cy } };
        });
      return [...place(left, true), ...place(right, false)];
    };

    const bez = (t, { p0, p1, p2, p3 }) => {
      const u = 1 - t;
      return {
        x: u ** 3 * p0.x + 3 * u ** 2 * t * p1.x + 3 * u * t ** 2 * p2.x + t ** 3 * p3.x,
        y: u ** 3 * p0.y + 3 * u ** 2 * t * p1.y + 3 * u * t ** 2 * p2.y + t ** 3 * p3.y,
      };
    };

    // Particles persist per guest key so speed changes don't reset positions.
    const particles = new Map();
    const particlesFor = (key, count, speed) => {
      let list = particles.get(key);
      if (!list) {
        list = [];
        particles.set(key, list);
      }
      while (list.length < count) list.push({ t: Math.random(), speed });
      if (list.length > count) list.length = count;
      list.forEach((p) => (p.speed = speed));
      return list;
    };

    const nearest = (x, y) => {
      let best = null;
      let bestD = 18;
      for (const path of s.paths) {
        for (let t = 0; t <= 1; t += 0.05) {
          const p = bez(t, path);
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < bestD) {
            bestD = d;
            best = path.item.key;
          }
        }
      }
      return best;
    };

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      const key = nearest(e.clientX - r.left, e.clientY - r.top);
      canvas.style.cursor = key ? "pointer" : "default";
      onHover?.(key);
    };
    const onLeave = () => onHover?.(null);
    const onClick = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      s.pulses.push({ x, y, radius: 0, life: 1 });
      const key = nearest(x, y);
      if (key) onSelect?.(key);
    };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("click", onClick);

    const onVis = () => {
      running = !document.hidden;
      if (running) raf = requestAnimationFrame(render);
    };
    document.addEventListener("visibilitychange", onVis);

    const mono = () => `10px ${s.ct.fonts.mono}`;

    function render() {
      if (!running) return;
      const { w, h, ct: c } = s;
      ctx.clearRect(0, 0, w, h);
      s.paths = geometry();

      s.pulses.forEach((p) => {
        p.radius += 9;
        p.life -= 0.02;
      });
      s.pulses = s.pulses.filter((p) => p.life > 0);

      // center host ring
      const cx = w / 2;
      const cy = h / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.strokeStyle = c.colors.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = c.colors.accent;
      ctx.fill();
      if (s.label) {
        ctx.font = `600 11px ${c.fonts.mono}`;
        ctx.fillStyle = c.colors.text;
        ctx.textAlign = "center";
        ctx.fillText(s.label.toUpperCase(), cx, cy + 30);
      }

      for (const path of s.paths) {
        const { item, isLeft, p0 } = path;
        const running = item.status === "running";
        const hot = s.hot === item.key;
        const sel = s.sel === item.key;
        const dim = s.hot && !hot;
        const color = item.color || c.colors.muted;

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(path.p1.x, path.p1.y, path.p2.x, path.p2.y, path.p3.x, path.p3.y);
        ctx.strokeStyle = hot || sel ? color : c.colors.line;
        ctx.globalAlpha = dim ? 0.45 : running ? 0.95 : 0.4;
        ctx.lineWidth = hot ? 1.8 : 1.1;
        ctx.setLineDash(running ? [1, 4] : [2, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        // label at the edge
        ctx.font = mono();
        ctx.textAlign = isLeft ? "left" : "right";
        ctx.fillStyle = hot || sel ? color : running ? c.colors.muted : c.colors.faint;
        ctx.fillText(item.name, isLeft ? 6 : w - 6, p0.y - 6);

        if (running) {
          const cpu = Math.max(0, Math.min(1, Number(item.cpu) || 0));
          const count = 1 + Math.min(5, Math.round(cpu * 12));
          const speed = 0.0015 + cpu * 0.01;
          for (const p of particlesFor(item.key, count, speed)) {
            p.t += p.speed * (hot ? 1.6 : 1);
            if (p.t > 1) p.t = 0;
            const pos = bez(p.t, path);
            let dx = 0;
            let dy = 0;
            for (const pulse of s.pulses) {
              const ox = pos.x - pulse.x;
              const oy = pos.y - pulse.y;
              const dist = Math.hypot(ox, oy) || 1;
              if (Math.abs(dist - pulse.radius) < 80) {
                const force = (1 - Math.abs(dist - pulse.radius) / 80) * pulse.life;
                dx += (ox / dist) * force * 40;
                dy += (oy / dist) * force * 40;
              }
            }
            ctx.fillStyle = color;
            ctx.globalAlpha = dim ? 0.3 : 0.95;
            const size = hot ? 3.5 : 2.5;
            ctx.fillRect(pos.x + dx - size / 2, pos.y + dy - size / 2, size, size);
          }
        }
        ctx.globalAlpha = 1;
      }

      // pulses
      for (const pulse of s.pulses) {
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
        ctx.strokeStyle = c.colors.accent;
        ctx.globalAlpha = pulse.life * 0.35;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(render);
    }
    raf = requestAnimationFrame(render);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVis);
    };
    // handlers are read through refs; mount once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={hostRef} className="flow" aria-label="Guest flow graph">
      <canvas ref={canvasRef} />
    </div>
  );
}
