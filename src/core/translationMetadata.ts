// Bible Projection App - Translation Display Metadata
// Maps translation codes to human-readable names for use on the projection screen.

export const TRANSLATION_DISPLAY_NAMES: Record<string, string> = {
  KJV: 'King James Version',
  NIV: 'New International Version',
  NKJV: 'New King James Version',
  NLT: 'New Living Translation',
  AMP: 'Amplified Bible',
};

/**
 * Get the human-readable name for a translation code.
 * Falls back to the code itself if not registered (future-proof for new translations).
 */
export function getTranslationDisplayName(code: string): string {
  return TRANSLATION_DISPLAY_NAMES[code] || code;
}
