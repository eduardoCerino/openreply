import type { TranscribedWord } from "@/lib/blog/openai";
import { toWritten } from "@/lib/video/script";

// Burned-in subtitles, added in editing (ffmpeg + libass) instead of asking the
// video model to write them: the final video's audio is transcribed with word
// timings, grouped into short TikTok-style captions and drawn by ffmpeg's
// `subtitles` filter from an .ass file (lib/video/render.ts).

export interface Caption {
  start: number;
  end: number;
  text: string;
}

const MAX_WORDS = 3;
const MAX_CHARS = 22;
/** A pause this long (seconds) starts a new caption. */
const BREAK_GAP = 0.5;
/** Shorter gaps are bridged so captions do not flicker between words. */
const BRIDGE_GAP = 0.3;
const MIN_DURATION = 0.4;

/** Groups timed words into short captions: at most 3 words, broken at pauses and punctuation. */
export function groupCaptions(words: TranscribedWord[]): Caption[] {
  const captions: Caption[] = [];
  let current: TranscribedWord[] = [];
  const flush = () => {
    if (!current.length) return;
    const text = toWritten(current.map((word) => word.word.trim()).join(" ")).replace(/[.,;:]+$/u, "");
    captions.push({ start: current[0].start, end: current[current.length - 1].end, text });
    current = [];
  };
  for (const word of words) {
    const previous = current[current.length - 1];
    const text = [...current, word].map((item) => item.word.trim()).join(" ");
    if (
      previous &&
      (current.length >= MAX_WORDS || text.length > MAX_CHARS || word.start - previous.end > BREAK_GAP)
    ) {
      flush();
    }
    current.push(word);
    if (/[.!?,;:]$/u.test(word.word.trim())) flush();
  }
  flush();

  // Bridge small gaps and give every caption a readable minimum length.
  return captions.map((caption, index) => {
    const next = captions[index + 1];
    let end = Math.max(caption.end, caption.start + MIN_DURATION);
    if (next && next.start - end < BRIDGE_GAP) end = next.start;
    if (next) end = Math.min(end, next.start);
    return { ...caption, end };
  });
}

function assTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 100));
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000) % 60;
  const h = Math.floor(total / 360000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function assText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/[{}]/g, "").replace(/\n/g, " ");
}

/**
 * An .ass subtitle file for the 720x1280 render: bold white text with a black
 * outline, centered in the lower third, above the Reels caption and buttons.
 */
export function buildAss(captions: Caption[]): string {
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 720",
    "PlayResY: 1280",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Montserrat,58,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,1,2,60,60,330,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...captions.map(
      (caption) => `Dialogue: 0,${assTime(caption.start)},${assTime(caption.end)},Default,,0,0,0,,${assText(caption.text)}`
    ),
    "",
  ].join("\n");
}

/**
 * The words the video is expected to say, to guide the transcription
 * (whisper reads at most ~224 tokens of prompt): quoted dialogue when the
 * script has it, else the text itself.
 */
export function expectedSpeech(script: string): string {
  const quoted = [...script.matchAll(/[“"]([^”"]{2,})[”"]/gu)].map((match) => match[1].trim());
  return (quoted.length ? quoted.join(" ") : script).replace(/\s+/g, " ").trim().slice(0, 700);
}
