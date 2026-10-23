let context: AudioContext | null = null;
export async function prepareFocusSound() {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') await context.resume();
  } catch {
    /* Sound is optional; a browser restriction must not interrupt the timer. */
  }
}
export function playFocusSound() {
  if (!context || context.state !== 'running') return;
  try {
    const now = context.currentTime;
    for (const [offset, frequency] of [
      [0, 660],
      [0.25, 880],
    ]) {
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      volume.gain.setValueAtTime(0, now + offset);
      volume.gain.linearRampToValueAtTime(0.12, now + offset + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.6);
      oscillator.connect(volume);
      volume.connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.65);
    }
  } catch {
    /* Timer data is already committed. */
  }
}
