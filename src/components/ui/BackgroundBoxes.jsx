import React from "react";
import { motion } from "motion/react";
import { cn } from "../../lib/cn.js";

const colorPalette = [
  "#93c5fd",
  "#f9a8d4",
  "#86efac",
  "#fde047",
  "#fca5a5",
  "#d8b4fe",
  "#a5b4fc",
  "#c4b5fd",
];

function getRandomColor() {
  return colorPalette[Math.floor(Math.random() * colorPalette.length)];
}

const MotionDiv = motion.div;

const BoxesCore = ({ className, rows = 60, cols = 30, ...rest }) => {
  return (
    <div
      style={{
        transform: "translate(-40%,-60%) skewX(-48deg) skewY(14deg) scale(0.675)",
      }}
      className={cn(
        "absolute -top-1/4 left-1/4 z-0 flex h-full w-full -translate-x-1/2 -translate-y-1/2 p-4",
        className,
      )}
      {...rest}
    >
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <MotionDiv
          key={`row-${rowIndex}`}
          className="relative h-8 w-16 border-l border-slate-800/60"
        >
          {Array.from({ length: cols }).map((_, colIndex) => (
            <MotionDiv
              key={`col-${rowIndex}-${colIndex}`}
              whileHover={{
                backgroundColor: getRandomColor(),
                transition: { duration: 0 },
              }}
              className="relative h-8 w-16 border-t border-r border-slate-800/60"
            >
              {colIndex % 2 === 0 && rowIndex % 2 === 0 ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="pointer-events-none absolute -top-[14px] -left-[22px] h-6 w-10 stroke-[1px] text-slate-800/80"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                </svg>
              ) : null}
            </MotionDiv>
          ))}
        </MotionDiv>
      ))}
    </div>
  );
};

export const Boxes = React.memo(BoxesCore);

export function BackgroundBoxes({ className, title, subtitle }) {
  return (
    <div
      className={cn(
        "relative flex min-h-[24rem] w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-slate-950",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 z-20 bg-slate-950 [mask-image:radial-gradient(transparent,white)]" />
      <Boxes />
      {title ? (
        <h1 className="relative z-20 text-center text-3xl font-semibold tracking-tight text-white md:text-4xl">
          {title}
        </h1>
      ) : null}
      {subtitle ? (
        <p className="relative z-20 mt-3 max-w-2xl text-center text-base text-slate-200 md:text-lg">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
