type InviteDialogProps = {
  roomCode: string;
  inviteUrl: string;
  message: string;
  canShare: boolean;
  onClose: () => void;
  onCopy: () => void;
  onShare: () => void;
};

type InviteIconName = "copy" | "share" | "whatsapp" | "telegram" | "email";

function InviteIcon({ name }: { name: InviteIconName }): JSX.Element {
  const iconProps = { className: "invite-icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

  if (name === "copy") {
    return <svg {...iconProps}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
  }
  if (name === "share") {
    return <svg {...iconProps}><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" /></svg>;
  }
  if (name === "whatsapp") {
    return <svg {...iconProps}><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z" /><path d="M9 8.2c.2-.4.5-.4.8-.4h.5c.2 0 .4.1.5.4l.7 1.5c.1.3.1.5-.1.7l-.6.7c.7 1.2 1.6 2.1 2.8 2.8l.7-.6c.2-.2.4-.2.7-.1l1.5.7c.3.1.4.3.4.5v.5c0 .3-.1.6-.4.8-.5.3-1.2.4-1.8.2-2.1-.7-4.8-3.4-5.5-5.5-.2-.6-.1-1.3.2-1.8Z" /></svg>;
  }
  if (name === "telegram") {
    return <svg {...iconProps}><path d="m21 3-3.2 18-6.2-5.4-3.4 2.7.7-5.3L21 3Z" /><path d="m9 13 7.2-6.2-5.9 7.3" /></svg>;
  }
  return <svg {...iconProps}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>;
}

export function InviteDialog({ roomCode, inviteUrl, message, canShare, onClose, onCopy, onShare }: InviteDialogProps): JSX.Element {
  const encodedMessage = encodeURIComponent(message);
  const encodedUrl = encodeURIComponent(inviteUrl);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="invite-modal-header">
          <div>
            <span className="eyebrow">ROOM {roomCode}</span>
            <h2 id="invite-title">Bring your team in</h2>
          </div>
          <button className="modal-close" type="button" aria-label="Close invite dialog" onClick={onClose}>×</button>
        </div>
        <p className="invite-description">Send this invite to your friends. They can open the link or enter the room code from the landing page.</p>
        <div className="invite-preview">{message}</div>
        <div className="invite-primary-actions">
          <button className="primary button-with-icon" type="button" onClick={onCopy}><InviteIcon name="copy" /><span>Copy invitation</span></button>
          <button className="secondary" type="button" disabled={!canShare} onClick={onShare}>
            <InviteIcon name="share" /><span>{canShare ? "Share from device" : "Device share unavailable"}</span>
          </button>
        </div>
        <div className="invite-apps">
          <span className="eyebrow">OPEN IN AN APP</span>
          <div className="invite-app-grid">
            <a className="invite-app" href={`https://wa.me/?text=${encodedMessage}`} target="_blank" rel="noreferrer"><InviteIcon name="whatsapp" /><span>WhatsApp</span></a>
            <a className="invite-app" href={`https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(`Join room ${roomCode} on Sketch League`)}`} target="_blank" rel="noreferrer"><InviteIcon name="telegram" /><span>Telegram</span></a>
            <a className="invite-app" href={`mailto:?subject=${encodeURIComponent("Join my Sketch League room")}&body=${encodedMessage}`}><InviteIcon name="email" /><span>Email</span></a>
          </div>
        </div>
        <button className="invite-link" type="button" onClick={onClose}>Maybe later</button>
      </section>
    </div>
  );
}
