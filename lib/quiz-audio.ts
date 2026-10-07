export const SOUND_STORAGE_KEY = "gestor-quiz-sound";
type SoundKind = "correct" | "wrong" | "combo" | "win";
let audioContext: AudioContext | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

export function readSoundEnabled() {
  try { return window.localStorage.getItem(SOUND_STORAGE_KEY) === "on"; } catch { return false; }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  // Short cues must mix with music from other apps rather than claim exclusive playback.
  try { const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession; if (session) session.type = "transient"; } catch { /* unsupported */ }
  audioContext ??= new AudioCtor();
  return audioContext;
}

/** Release the audio device when muted, hidden or leaving the quiz. */
export function stopQuizSound() {
  if (releaseTimer !== null) clearTimeout(releaseTimer);
  releaseTimer = null;
  const context = audioContext;
  audioContext = null;
  if (context && context.state !== "closed") void context.close().catch(() => {});
}

/** Short synthesised cues (no audio files). Off by default; the student turns them on. */
export function playQuizSound(kind: SoundKind) {
  if (typeof window === "undefined" || document.visibilityState === "hidden" || !readSoundEnabled()) return;
  try {
    const context = audio();
    if (!context) return;
    if (context.state !== "running") void context.resume().catch(() => {});
    const notes: Record<SoundKind, Array<[number, number, OscillatorType]>> = {
      correct: [[660, 0, "triangle"], [990, 0.09, "triangle"]],
      wrong: [[240, 0, "square"], [180, 0.13, "square"]],
      combo: [[660, 0, "triangle"], [880, 0.07, "triangle"], [1320, 0.14, "triangle"]],
      win: [[523, 0, "triangle"], [659, 0.12, "triangle"], [784, 0.24, "triangle"], [1047, 0.36, "triangle"]],
    };
    for (const [frequency, delay, type] of notes[kind]) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      const start = context.currentTime + 0.01 + delay;
      const peak = type === "square" ? 0.12 : 0.3;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.26);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
    // Do not leave a silent running context holding the device between answers.
    if (releaseTimer !== null) clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      if (audioContext === context && context.state === "running") void context.suspend().catch(() => {});
    }, 800);
  } catch { /* Audio is a nicety. */ }
}

