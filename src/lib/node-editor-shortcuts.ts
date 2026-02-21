import {
  type ContentRowArrowIntent,
  type ContentRowEnterIntent,
  type ContentRowEscapeIntent,
  type ContentRowForceCreateIntent,
  resolveContentRowArrowIntent,
  resolveContentRowEnterIntent,
  resolveContentRowEscapeIntent,
  resolveContentRowForceCreateIntent,
} from './row-interactions.js';

export type NodeEditorEnterIntent = ContentRowEnterIntent;

interface ResolveNodeEditorEnterIntentParams {
  referenceActive: boolean;
  hashTagActive: boolean;
  slashActive: boolean;
}

export function resolveNodeEditorEnterIntent(
  params: ResolveNodeEditorEnterIntentParams,
): NodeEditorEnterIntent {
  return resolveContentRowEnterIntent(params);
}

export type NodeEditorArrowIntent = ContentRowArrowIntent;

interface ResolveNodeEditorArrowIntentParams {
  referenceActive: boolean;
  hashTagActive: boolean;
  slashActive: boolean;
  isAtBoundary: boolean;
}

export function resolveNodeEditorArrowIntent(
  params: ResolveNodeEditorArrowIntentParams,
): NodeEditorArrowIntent {
  return resolveContentRowArrowIntent(params);
}

export type NodeEditorEscapeIntent = ContentRowEscapeIntent;

export function resolveNodeEditorEscapeIntent(
  referenceActive: boolean,
  hashTagActive: boolean,
  slashActive: boolean,
): NodeEditorEscapeIntent {
  return resolveContentRowEscapeIntent({ referenceActive, hashTagActive, slashActive });
}

export type NodeEditorForceCreateIntent = ContentRowForceCreateIntent;

export function resolveNodeEditorForceCreateIntent(
  referenceActive: boolean,
  hashTagActive: boolean,
  slashActive: boolean,
): NodeEditorForceCreateIntent {
  return resolveContentRowForceCreateIntent({ referenceActive, hashTagActive, slashActive });
}
