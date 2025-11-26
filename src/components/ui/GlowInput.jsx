import { forwardRef, useState } from "react";
import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import { cn } from "../../lib/cn.js";

const GlowInput = forwardRef(function GlowInput(
  { label, helper, containerClassName = "", inputClassName = "", id, name, ...props },
  ref,
) {
  const radius = 120;
  const [visible, setVisible] = useState(false);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const inputId = id || name;

  const handleMouseMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    mouseX.set(event.clientX - rect.left);
    mouseY.set(event.clientY - rect.top);
  };

  const background = useMotionTemplate`
    radial-gradient(
      ${visible ? `${radius}px` : "0px"} circle at ${mouseX}px ${mouseY}px,
      rgba(56, 189, 248, 0.45),
      transparent 70%
    )
  `;

  const MotionDiv = motion.div;

  return (
    <label className={cn("glow-field", containerClassName)} htmlFor={inputId}>
      {label && <span className="glow-label">{label}</span>}
      <MotionDiv
        className="glow-shell"
        style={{ background }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        transition={{ type: "spring", stiffness: 120, damping: 15 }}
      >
        <input
          id={inputId}
          name={name}
          ref={ref}
          className={cn("glow-input", inputClassName)}
          {...props}
        />
      </MotionDiv>
      {helper && <small className="glow-helper">{helper}</small>}
    </label>
  );
});

export default GlowInput;
