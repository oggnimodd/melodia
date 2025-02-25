export function formatSecondsToTime(seconds: number) {
  const floored = Math.floor(seconds);
  const m = Math.floor(floored / 60);
  const s = floored % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
