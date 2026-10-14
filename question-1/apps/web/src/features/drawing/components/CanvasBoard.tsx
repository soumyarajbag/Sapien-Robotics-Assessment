import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { DrawingOperation, PublicOperation } from "@sapien/protocol";
import { DRAWING_COLORS } from "../../../shared/constants";
import type { DrawingStroke } from "../../../shared/types/game";
import { DrawingToolbar } from "./DrawingToolbar";
import { getCanvasPoint, renderOperations } from "../lib/canvas-renderer";

type CanvasBoardProps = {
  operations: PublicOperation[];
  canDraw: boolean;
  onOperation?: (operation: DrawingOperation) => void;
  onDrawStart?: () => void;
  replayMode?: boolean;
};

export function CanvasBoard({ operations, canDraw, onOperation, onDrawStart, replayMode = false }: CanvasBoardProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<"pen" | "eraser" | "fill">("pen");
  const [color, setColor] = useState(DRAWING_COLORS[0]);
  const [size, setSize] = useState(6);
  const [localStroke, setLocalStroke] = useState<DrawingStroke>();

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.width * 0.62 * ratio);
    renderOperations(canvas, operations, localStroke);
  }, [localStroke, operations]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  useEffect(() => {
    if (canvasRef.current) renderOperations(canvasRef.current, operations, localStroke);
  }, [operations, localStroke]);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (!canDraw || replayMode) return;
    onDrawStart?.();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getCanvasPoint(event.nativeEvent, event.currentTarget);
    if (tool === "fill") {
      onOperation?.({ kind: "fill", id: `op_${crypto.randomUUID()}`, color, point });
      return;
    }
    setLocalStroke({ kind: "stroke", id: `op_${crypto.randomUUID()}`, tool, color, size, points: [point] });
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (!localStroke || !canDraw || replayMode) return;
    const point = getCanvasPoint(event.nativeEvent, event.currentTarget);
    const previous = localStroke.points[localStroke.points.length - 1];
    if (previous && Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 0.002) return;
    setLocalStroke({ ...localStroke, points: [...localStroke.points, point] });
  };

  const finishStroke = (): void => {
    if (!localStroke) return;
    onOperation?.(localStroke);
    setLocalStroke(undefined);
  };

  return (
    <div className="canvas-stack">
      <div className="canvas-shell" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          aria-label="Drawing canvas"
        />
        {!canDraw && !replayMode && <div className="canvas-lock">Watch the drawing appear here</div>}
      </div>
      {canDraw && !replayMode && (
        <DrawingToolbar
          operations={operations}
          tool={tool}
          color={color}
          size={size}
          onToolChange={setTool}
          onColorChange={setColor}
          onSizeChange={setSize}
          onOperation={(operation) => onOperation?.(operation)}
        />
      )}
    </div>
  );
}
