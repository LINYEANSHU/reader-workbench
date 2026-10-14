const sliderEffortLevels = ['low', 'high', 'max'] as const;

export function getSliderEffortLevels(available?: string[]): string[] {
  return sliderEffortLevels.filter(level => available?.includes(level));
}

export function resolveReasoningEffort(available?: string[], preferred?: string, fallback?: string): string {
  const sliderLevels = getSliderEffortLevels(available);

  if (sliderLevels.length) {
    if (preferred && sliderLevels.includes(preferred)) return preferred;
    if (fallback && sliderLevels.includes(fallback)) return fallback;
    return sliderLevels[0]!;
  }

  if (preferred && available?.includes(preferred)) return preferred;
  return fallback ?? available?.[0] ?? '';
}
