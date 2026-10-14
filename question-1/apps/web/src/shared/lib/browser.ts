export function createRequestId(): string {
  return crypto.randomUUID();
}

export function getRoomIdFromUrl(): string | null {
  const roomId = new URLSearchParams(window.location.search).get("room");
  return roomId && /^[a-z0-9]{6}$/.test(roomId) ? roomId : null;
}

export function getSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export function getResumeStorageKey(roomId: string): string {
  return `resume:${roomId}`;
}

export function updateRoomUrl(roomId: string): void {
  window.history.replaceState({}, "", `?room=${roomId}`);
}

export function formatTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand("copy");
    textArea.remove();
    return copied;
  } catch {
    return false;
  }
}

export async function shareInvite(title: string, text: string): Promise<"shared" | "cancelled" | "unavailable"> {
  if (!navigator.share) return "unavailable";

  try {
    await navigator.share({ title, text });
    return "shared";
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "unavailable";
  }
}
