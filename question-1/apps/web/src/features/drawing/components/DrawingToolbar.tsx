import type { DrawingOperation, PublicOperation } from "@sapien/protocol";
import { DRAWING_COLORS } from "../../../shared/constants";
import { findUndoTarget } from "../lib/canvas-renderer";

type DrawingTool = "pen" | "eraser" | "fill";

type DrawingToolbarProps = {
  operations: PublicOperation[];
  tool: DrawingTool;
  color: string;
  size: number;
  onToolChange: (tool: DrawingTool) => void;
  onColorChange: (color: string) => void;
  onSizeChange: (size: number) => void;
  onOperation: (operation: DrawingOperation) => void;
};

export function DrawingToolbar({
  operations,
  tool,
  color,
  size,
  onToolChange,
  onColorChange,
  onSizeChange,
  onOperation,
}: DrawingToolbarProps): JSX.Element {
  const emit = (operation: Omit<DrawingOperation, "id">): void => {
    onOperation({ ...operation, id: `op_${crypto.randomUUID()}` } as DrawingOperation);
  };

  return (
    <div className="toolbar">
      <div className="tool-group">
        {(["pen", "eraser", "fill"] as const).map((item) => (
          <button key={item} className={tool === item ? "tool active" : "tool"} onClick={() => onToolChange(item)}>
            {item === "pen" ? "✎ Pen" : item === "eraser" ? "⌫ Eraser" : "◉ Fill"}
          </button>
        ))}
        <button className="tool" onClick={() => {
          const targetId = findUndoTarget(operations);
          if (targetId) emit({ kind: "undo", targetId });
        }}>↶ Undo</button>
        <button className="tool" onClick={() => emit({ kind: "clear" })}>Clear</button>
      </div>
      <div className="colour-row">
        {DRAWING_COLORS.map((item) => (
          <button
            aria-label={`Use ${item}`}
            key={item}
            className={color === item ? "colour selected" : "colour"}
            style={{ background: item }}
            onClick={() => onColorChange(item)}
          />
        ))}
      </div>
      <label className="range-label">
        Brush
        <input type="range" min="2" max="24" value={size} onChange={(event) => onSizeChange(Number(event.target.value))} />
      </label>
    </div>
  );
}
