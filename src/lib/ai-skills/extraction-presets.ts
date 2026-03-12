/**
 * Extraction presets — predefined #skill rules for Spark structure extraction.
 *
 * These are hardcoded rule sets used until the user creates their own #skill
 * nodes. Phase 5 will let users edit and extend these via the UI.
 */

export const ARTICLE_EXTRACTION_RULES: readonly string[] = [
  'Extract the core argumentation framework, not a list of bullet-point summaries.',
  'Identify implicit assumptions and boundary conditions the author relies on.',
  'Distinguish the author\'s own claims from cited or referenced viewpoints.',
  'Surface the logical structure: premise \u2192 reasoning \u2192 conclusion.',
  'Note any tensions or contradictions within the argument.',
];

export const VIDEO_EXTRACTION_RULES: readonly string[] = [
  'Extract the core structure of the presentation or discussion.',
  'Identify key arguments and their supporting evidence.',
  'Distinguish between the speaker\'s conclusions and cited sources.',
  'Note any demonstrated techniques or workflows.',
];

export const SOCIAL_EXTRACTION_RULES: readonly string[] = [
  'Extract the core claim or observation being made.',
  'Identify the implicit context the author assumes the reader knows.',
  'Note whether this is an original insight, a reaction, or a summary.',
];

export const GENERAL_EXTRACTION_RULES: readonly string[] = [
  'Extract the core structure and key concepts of the content.',
  'Identify the main arguments and their supporting evidence.',
  'Distinguish between primary claims and supporting details.',
  'Note implicit assumptions or boundary conditions.',
];

/**
 * Get extraction rules based on content type.
 *
 * @param contentType - The clip type (article, video, social, or source/general)
 */
export function getExtractionRules(contentType?: string): readonly string[] {
  switch (contentType) {
    case 'article':
      return ARTICLE_EXTRACTION_RULES;
    case 'video':
      return VIDEO_EXTRACTION_RULES;
    case 'social':
      return SOCIAL_EXTRACTION_RULES;
    default:
      return GENERAL_EXTRACTION_RULES;
  }
}
