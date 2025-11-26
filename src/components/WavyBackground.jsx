import { useEffect, useMemo, useRef } from "react";
import { createNoise3D } from "simplex-noise";

const SPEEDS = {
  slow: 0.001,
  fast: 0.002,
};

function WavyBackground({
  children,
  className = "",
  containerClassName = "",
  colors = ["#38bdf8", "#818cf8", "#c084fc", "#22d3ee"],
  waveWidth = 45,
  backgroundFill = "#020617",
  blur = 12,
  speed = "fast",
  waveOpacity = 0.55,
}) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const noise = useMemo(() => createNoise3D(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let width = (ctx.canvas.width = window.innerWidth);
    let height = (ctx.canvas.height = window.innerHeight);
    ctx.filter = `blur(${blur}px)`;

    const handleResize = () => {
      width = ctx.canvas.width = window.innerWidth;
      height = ctx.canvas.height = window.innerHeight;
      ctx.filter = `blur(${blur}px)`;
    };

    window.addEventListener("resize", handleResize);

    let time = 0;
    const speedValue = SPEEDS[speed] ?? SPEEDS.fast;

    const drawWave = (waveCount) => {
      time += speedValue;
      for (let i = 0; i < waveCount; i += 1) {
        ctx.beginPath();
        ctx.lineWidth = waveWidth;
        ctx.strokeStyle = colors[i % colors.length];
        for (let x = 0; x < width; x += 5) {
          const y = noise(x / 800, 0.35 * i, time) * 140;
          ctx.lineTo(x, y + height * 0.5);
        }
        ctx.stroke();
        ctx.closePath();
      }
    };

    const render = () => {
      ctx.fillStyle = backgroundFill;
      ctx.globalAlpha = waveOpacity;
      ctx.fillRect(0, 0, width, height);
      drawWave(4);
      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", handleResize);
    };
  }, [backgroundFill, blur, colors, noise, speed, waveOpacity, waveWidth]);

  return (
    <div className={`wavy-container ${containerClassName}`}>
      <canvas ref={canvasRef} className="wavy-canvas" />
      <div className={`wavy-content ${className}`}>{children}</div>
    </div>
  );
}

export default WavyBackground;
