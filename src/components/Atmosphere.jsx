// Fixed background: color blooms, drifting glass shards, plus-grid, grain.
// ponytail: pure CSS animation, no rAF loop. Tune SHARDS for composition, not code.
const SHARDS = [
  { x: -8, y: 58, w: 560, h: 64, r: -38, b: 14, o: 0.55, d: 0 },
  { x: -2, y: 74, w: 420, h: 42, r: -34, b: 8, o: 0.45, d: -6 },
  { x: 6, y: 88, w: 640, h: 90, r: -40, b: 22, o: 0.35, d: -11 },
  { x: 14, y: 40, w: 300, h: 26, r: -36, b: 4, o: 0.5, d: -3 },
  { x: 22, y: 66, w: 380, h: 30, r: -42, b: 10, o: 0.3, d: -15 },
  { x: 70, y: -4, w: 520, h: 54, r: 28, b: 16, o: 0.4, d: -8 },
  { x: 82, y: 12, w: 360, h: 34, r: 24, b: 6, o: 0.45, d: -2 },
  { x: 88, y: 30, w: 620, h: 80, r: 30, b: 24, o: 0.3, d: -13 },
  { x: 60, y: 84, w: 300, h: 22, r: 22, b: 5, o: 0.35, d: -9 },
];

export default function Atmosphere() {
  return (
    <div className="atmo" aria-hidden="true">
      <div className="atmo__bloom atmo__bloom--cool" />
      <div className="atmo__bloom atmo__bloom--warm" />
      <div className="atmo__shards">
        {SHARDS.map((s, i) => (
          <i
            key={i}
            style={{
              "--x": `${s.x}vw`,
              "--y": `${s.y}vh`,
              "--w": `${s.w}px`,
              "--h": `${s.h}px`,
              "--r": `${s.r}deg`,
              "--b": `${s.b}px`,
              "--o": s.o,
              "--d": `${s.d}s`,
            }}
          />
        ))}
      </div>
      <div className="atmo__grid" />
      <div className="atmo__grain" />
      <div className="atmo__crt" />
    </div>
  );
}
