import { useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn.js";

/**
 * Lightweight background ripple grid. Use inside a relative container;
 * pass interactive={false} when it should stay decorative-only.
 */
export default function BackgroundRippleEffect({
  rows = 8,
  cols = 24,
  cellSize = 56,
  interactive = false,
  className,
}) {
  const [clickedCell, setClickedCell] = useState(null);
  const [rippleKey, setRippleKey] = useState(0);
  const ref = useRef(null);

  return (
    <div
      ref={ref}
      className={cn("ripple-bg absolute inset-0 h-full w-full pointer-events-none", className)}
    >
      <DivGrid
        key={`base-${rippleKey}`}
        rows={rows}
        cols={cols}
        cellSize={cellSize}
        borderColor="rgba(148,163,184,0.18)"
        fillColor="rgba(12,20,35,0.35)"
        shadowColor="rgba(15,23,42,0.35)"
        clickedCell={clickedCell}
        onCellClick={(row, col) => {
          setClickedCell({ row, col });
          setRippleKey((k) => k + 1);
        }}
        interactive={interactive}
      />
    </div>
  );
}

function DivGrid({
  className,
  rows,
  cols,
  cellSize,
  borderColor,
  fillColor,
  shadowColor,
  clickedCell = null,
  onCellClick = () => {},
  interactive = true,
}) {
  const cells = useMemo(() => Array.from({ length: rows * cols }, (_, idx) => idx), [rows, cols]);

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
    gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
    width: "120vw",
    height: "120vh",
  };

  return (
    <div className={cn("relative z-[1] opacity-70", className)} style={gridStyle}>
      {cells.map((idx) => {
        const rowIdx = Math.floor(idx / cols);
        const colIdx = idx % cols;
        const distance = clickedCell ? Math.hypot(clickedCell.row - rowIdx, clickedCell.col - colIdx) : 0;
        const delay = clickedCell ? Math.max(0, distance * 55) : 0;
        const duration = 200 + distance * 80;

        const style = clickedCell
          ? {
              "--delay": `${delay}ms`,
              "--duration": `${duration}ms`,
            }
          : {};

        return (
          <div
            key={idx}
            className={cn(
              "cell relative border-[0.5px] opacity-40 transition-opacity duration-150 will-change-transform",
              interactive && "hover:opacity-80 cursor-pointer",
              clickedCell && "animate-cell-ripple [animation-fill-mode:none]"
            )}
            style={{
              backgroundColor: fillColor,
              borderColor,
              boxShadow: `0 0 40px 1px ${shadowColor} inset`,
              ...style,
            }}
            onClick={interactive ? () => onCellClick?.(rowIdx, colIdx) : undefined}
          />
        );
      })}
    </div>
  );
}
