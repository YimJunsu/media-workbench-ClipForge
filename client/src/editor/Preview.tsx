/**
 * Program monitor. Draws through the shared renderer, so the picture here and
 * the picture in the exported file come from the same code path.
 */
import { useEffect, useRef } from "react";
import { Clip, Project } from "./model";
import { FRAME_HEIGHT, FRAME_WIDTH, drawFrame } from "./render";

type Props = {
  project: Project;
  time: number;
  videoFor: (clip: Clip) => HTMLVideoElement | null;
  imageFor: (assetId: string) => HTMLImageElement | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
};

export default function Preview({
  project,
  time,
  videoFor,
  imageFor,
  canvasRef,
}: Props) {
  const stateRef = useRef({ project, time, videoFor, imageFor });
  stateRef.current = { project, time, videoFor, imageFor };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    let frame = 0;
    const draw = () => {
      const state = stateRef.current;
      drawFrame(context, state.project, state.time, {
        videoFor: state.videoFor,
        imageFor: state.imageFor,
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [canvasRef]);

  return (
    <canvas
      ref={canvasRef}
      width={project.frame?.width ?? FRAME_WIDTH}
      height={project.frame?.height ?? FRAME_HEIGHT}
      className="monitor-canvas"
    />
  );
}
