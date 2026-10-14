import { useEffect, useMemo, useState } from "react";
import type { Replay } from "../../../shared/types/game";
import { CanvasBoard } from "../../drawing/components/CanvasBoard";

export function ReplayViewer({ replay }: { replay: Replay }): JSX.Element {
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const operations = useMemo(
    () => [...replay.operations].sort((a, b) => a.eventSeq - b.eventSeq),
    [replay.operations],
  );

  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [replay.roundNumber, replay.word, operations]);

  useEffect(() => {
    if (!playing || operations.length === 0) return;
    const timer = window.setInterval(() => {
      setIndex((current) => {
        if (current + 1 >= operations.length) {
          setPlaying(false);
          return operations.length;
        }
        return current + 1;
      });
    }, Math.max(16, 80 / speed));
    return () => window.clearInterval(timer);
  }, [playing, operations.length, speed]);

  const togglePlayback = (): void => {
    if (operations.length === 0) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (index >= operations.length) setIndex(0);
    setPlaying(true);
  };

  return (
    <div className="replay-card">
      <div className="replay-title"><span>Round {replay.roundNumber} replay</span><strong>{replay.word}</strong></div>
      <CanvasBoard operations={operations.slice(0, index)} canDraw={false} replayMode />
      <div className="replay-controls">
        <button className="secondary" disabled={operations.length === 0} onClick={togglePlayback}>{playing ? "Pause" : "Play"}</button>
        <button className="secondary" onClick={() => { setIndex(0); setPlaying(false); }}>Restart</button>
        <input type="range" min="0" max={Math.max(1, operations.length)} value={index} onChange={(event) => { setPlaying(false); setIndex(Number(event.target.value)); }} />
        <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
        </select>
      </div>
    </div>
  );
}
