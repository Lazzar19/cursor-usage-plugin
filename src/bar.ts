export interface BarOptions {
  segments: number;
  fillGlyph: string;
  emptyGlyph: string;
}

export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 0;
  }
  return Math.min(100, Math.max(0, percent));
}

export function renderBar(percent: number, options: BarOptions): string {
  const segments = Math.max(1, Math.floor(options.segments));
  const clamped = clampPercent(percent);
  const filled = Math.round((clamped / 100) * segments);
  const empty = segments - filled;
  return options.fillGlyph.repeat(filled) + options.emptyGlyph.repeat(empty);
}
