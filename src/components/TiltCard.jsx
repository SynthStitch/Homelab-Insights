import { createContext, useContext, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn.js";

const MouseEnterContext = createContext(undefined);

export function CardContainer({
  children,
  className = "",
  containerClassName = "",
  as = "div",
}) {
  const containerRef = useRef(null);
  const [isMouseEntered, setIsMouseEntered] = useState(false);

  const handleMouseMove = (event) => {
    if (!containerRef.current) return;
    const { left, top, width, height } = containerRef.current.getBoundingClientRect();
    const x = (event.clientX - left - width / 2) / 25;
    const y = (event.clientY - top - height / 2) / 25;
    containerRef.current.style.transform = `rotateY(${x}deg) rotateX(${y}deg)`;
  };

  const handleMouseEnter = () => {
    setIsMouseEntered(true);
  };

  const handleMouseLeave = () => {
    if (!containerRef.current) return;
    setIsMouseEntered(false);
    containerRef.current.style.transform = "rotateY(0deg) rotateX(0deg)";
  };

  const OuterTag = as;

  return (
    <MouseEnterContext.Provider value={[isMouseEntered, setIsMouseEntered]}>
      <OuterTag className={cn("tilt-container", containerClassName)} style={{ perspective: "1200px" }}>
        <div
          ref={containerRef}
          className={cn("tilt-inner", className)}
          style={{ transformStyle: "preserve-3d" }}
          onMouseEnter={handleMouseEnter}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {children}
        </div>
      </OuterTag>
    </MouseEnterContext.Provider>
  );
}

export function CardBody({ children, className = "", as = "div" }) {
  const Tag = as;
  return (
    <Tag className={cn("tilt-body", className)} style={{ transformStyle: "preserve-3d" }}>
      {children}
    </Tag>
  );
}

export function CardItem({
  as = "div",
  children,
  className = "",
  translateX = 0,
  translateY = 0,
  translateZ = 0,
  rotateX = 0,
  rotateY = 0,
  rotateZ = 0,
  ...rest
}) {
  const ref = useRef(null);
  const [isMouseEntered] = useMouseEnter();
  const Tag = as;

  useEffect(() => {
    if (!ref.current) return;
    if (isMouseEntered) {
      ref.current.style.transform = `translateX(${translateX}px) translateY(${translateY}px) translateZ(${translateZ}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`;
    } else {
      ref.current.style.transform =
        "translateX(0) translateY(0) translateZ(0) rotateX(0deg) rotateY(0deg) rotateZ(0deg)";
    }
  }, [isMouseEntered, rotateX, rotateY, rotateZ, translateX, translateY, translateZ]);

  return (
    <Tag
      ref={ref}
      className={cn("tilt-item transition duration-200 ease-linear", className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

function useMouseEnter() {
  const context = useContext(MouseEnterContext);
  if (context === undefined) {
    throw new Error("useMouseEnter must be used within CardContainer");
  }
  return context;
}
