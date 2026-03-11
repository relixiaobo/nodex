export function extractSchemaOrgType(schemaOrgData: unknown): string | undefined {
  if (!schemaOrgData) return undefined;
  if (Array.isArray(schemaOrgData)) {
    for (const item of schemaOrgData) {
      const schemaType = (item as Record<string, unknown>)?.['@type'];
      if (typeof schemaType === 'string') return schemaType;
      if (Array.isArray(schemaType) && typeof schemaType[0] === 'string') return schemaType[0];
    }
    return undefined;
  }

  const schemaType = (schemaOrgData as Record<string, unknown>)?.['@type'];
  if (typeof schemaType === 'string') return schemaType;
  if (Array.isArray(schemaType) && typeof schemaType[0] === 'string') return schemaType[0];
  return undefined;
}

export function extractSchemaOrgAuthor(schemaOrgData: unknown): string | undefined {
  if (!schemaOrgData) return undefined;
  const items = Array.isArray(schemaOrgData) ? schemaOrgData : [schemaOrgData];
  for (const item of items) {
    const author = (item as Record<string, unknown>)?.author;
    if (typeof author === 'string' && author.trim()) return author.trim();
    if (author && typeof author === 'object') {
      const name = (author as Record<string, unknown>)?.name;
      if (typeof name === 'string' && name.trim()) return name.trim();
    }
  }
  return undefined;
}

export function extractDuration(
  schemaOrgData: unknown,
  document: Document,
): string | undefined {
  if (schemaOrgData) {
    const items = Array.isArray(schemaOrgData) ? schemaOrgData : [schemaOrgData];
    for (const item of items) {
      const duration = (item as Record<string, unknown>)?.duration;
      if (typeof duration === 'string') return duration;
    }
  }

  const meta = document.querySelector('meta[itemprop="duration"]');
  return meta?.getAttribute('content') ?? undefined;
}
