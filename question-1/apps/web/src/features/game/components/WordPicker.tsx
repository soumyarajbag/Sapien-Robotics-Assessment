import type { WordOption } from "../../../shared/types/game";

type WordPickerProps = {
  options: WordOption[];
  onChoose: (optionId: string) => void;
};

export function WordPicker({ options, onChoose }: WordPickerProps): JSX.Element | null {
  if (options.length === 0) return null;
  return (
    <div className="modal-backdrop">
      <div className="word-modal">
        <span className="eyebrow">YOUR TURN</span>
        <h2>Pick a word to draw</h2>
        <p>Everyone else is waiting. Choose one before the timer runs out.</p>
        <div className="word-options">
          {options.map((option) => (
            <button key={option.id} onClick={() => onChoose(option.id)}>
              {option.text}<span>Draw this →</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
