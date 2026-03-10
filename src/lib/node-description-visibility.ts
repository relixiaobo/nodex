interface DescriptionVisibilityParams {
  description: string | undefined;
  editing: boolean;
  tags?: string[];
}

export function shouldRenderNodeDescription(params: DescriptionVisibilityParams): boolean {
  const { description, editing } = params;
  return Boolean(description) || editing;
}
