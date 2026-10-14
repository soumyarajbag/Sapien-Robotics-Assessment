import type { DrawingOperation, PublicOperation } from "@sapien/protocol";
import type { DrawingStroke } from "../../../shared/types/game";

function colorToRgba(hex: string): [number, number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
    255,
  ];
}

function drawStroke(
  context: CanvasRenderingContext2D,
  operation: DrawingStroke,
  width: number,
  height: number,
): void {
  if (operation.points.length === 0) return;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = operation.size * (width / 800);
  context.strokeStyle = operation.color;
  context.globalCompositeOperation = operation.tool === "eraser" ? "destination-out" : "source-over";
  context.beginPath();
  operation.points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x * width, y * height);
    else context.lineTo(x * width, y * height);
  });
  if (operation.points.length === 1) {
    context.arc(operation.points[0][0] * width, operation.points[0][1] * height, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.stroke();
  }
  context.restore();
}

function floodFill(context: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  const canvas = context.canvas;
  const pixelX = Math.max(0, Math.min(canvas.width - 1, Math.floor(x * canvas.width)));
  const pixelY = Math.max(0, Math.min(canvas.height - 1, Math.floor(y * canvas.height)));
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  const start = (pixelY * canvas.width + pixelX) * 4;
  const target: [number, number, number, number] = [data[start], data[start + 1], data[start + 2], data[start + 3]];
  const replacement = colorToRgba(color);
  if (target.every((value, index) => value === replacement[index])) return;

  const matches = (index: number): boolean => (
    Math.abs(data[index] - target[0]) < 20
    && Math.abs(data[index + 1] - target[1]) < 20
    && Math.abs(data[index + 2] - target[2]) < 20
    && Math.abs(data[index + 3] - target[3]) < 20
  );
  const stack: [number, number][] = [[pixelX, pixelY]];
  const seen = new Uint8Array(canvas.width * canvas.height);

  while (stack.length > 0) {
    const [currentX, currentY] = stack.pop()!;
    if (currentX < 0 || currentY < 0 || currentX >= canvas.width || currentY >= canvas.height) continue;
    const pixel = currentY * canvas.width + currentX;
    if (seen[pixel]) continue;
    seen[pixel] = 1;
    const index = pixel * 4;
    if (!matches(index)) continue;
    data[index] = replacement[0];
    data[index + 1] = replacement[1];
    data[index + 2] = replacement[2];
    data[index + 3] = replacement[3];
    stack.push([currentX + 1, currentY], [currentX - 1, currentY], [currentX, currentY + 1], [currentX, currentY - 1]);
  }
  context.putImageData(image, 0, 0);
}

export function renderOperations(
  canvas: HTMLCanvasElement,
  operations: PublicOperation[],
  localStroke?: DrawingStroke,
): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  // Resolve undo targets before drawing. An undo arrives after the stroke it
  // targets, so handling it only while iterating would leave that stroke on
  // the canvas forever during both live rendering and replay.
  const undone = new Set(
    operations
      .filter((operation) => operation.kind === "undo")
      .map((operation) => operation.targetId),
  );
  for (const operation of operations) {
    if (operation.kind === "undo") continue;
    if (operation.kind === "clear") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      continue;
    }
    if (undone.has(operation.id)) continue;
    if (operation.kind === "stroke") drawStroke(context, operation, width, height);
    if (operation.kind === "fill") floodFill(context, operation.point[0], operation.point[1], operation.color);
  }
  if (localStroke) drawStroke(context, localStroke, width, height);
}

export function getCanvasPoint(event: PointerEvent, canvas: HTMLCanvasElement): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [
    Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  ];
}

export function findUndoTarget(operations: PublicOperation[]): string | undefined {
  return [...operations]
    .reverse()
    .find((operation) => operation.kind === "stroke" && !operations.some((candidate) => candidate.kind === "undo" && candidate.targetId === operation.id))?.id;
}
