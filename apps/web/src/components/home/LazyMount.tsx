"use client";
import { useEffect, useRef, useState } from "react";

/** Mounts children only while the block is near the viewport (keeps several 3D scenes on one page cheap). */
export function LazyMount({ children, className, placeholder }: { children: React.ReactNode; className?: string; placeholder?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      {on ? children : placeholder}
    </div>
  );
}
