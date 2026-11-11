"use client";
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/** Stops a canvas rendering while it is scrolled out of view, so several 3D scenes can share a page. */
export function PauseOffscreen() {
  const gl = useThree((s) => s.gl);
  const setFrameloop = useThree((s) => s.setFrameloop);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setFrameloop(e.isIntersecting ? "always" : "never"), { rootMargin: "120px 0px" });
    io.observe(gl.domElement);
    return () => io.disconnect();
  }, [gl, setFrameloop]);
  return null;
}
