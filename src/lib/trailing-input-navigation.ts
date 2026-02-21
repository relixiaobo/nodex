import {
  type TrailingRowArrowDownIntent,
  type TrailingRowArrowUpIntent,
  type TrailingRowBackspaceIntent,
  type TrailingRowEnterIntent,
  type TrailingRowEscapeIntent,
  resolveTrailingRowArrowDownIntent,
  resolveTrailingRowArrowUpIntent,
  resolveTrailingRowBackspaceIntent,
  resolveTrailingRowEnterIntent,
  resolveTrailingRowEscapeIntent,
} from './row-interactions.js';

export type TrailingBackspaceIntent = TrailingRowBackspaceIntent;

interface ResolveTrailingBackspaceIntentParams {
  isEditorEmpty: boolean;
  depthShifted: boolean;
  parentChildCount: number;
  hasLastVisibleTarget: boolean;
}

export function resolveTrailingBackspaceIntent(
  params: ResolveTrailingBackspaceIntentParams,
): TrailingBackspaceIntent {
  return resolveTrailingRowBackspaceIntent(params);
}

export type TrailingArrowDownIntent = TrailingRowArrowDownIntent;

interface ResolveTrailingArrowDownIntentParams {
  optionsOpen: boolean;
  optionCount: number;
  hasNavigateOut: boolean;
}

export function resolveTrailingArrowDownIntent(
  params: ResolveTrailingArrowDownIntentParams,
): TrailingArrowDownIntent {
  return resolveTrailingRowArrowDownIntent(params);
}

export type TrailingArrowUpIntent = TrailingRowArrowUpIntent;

interface ResolveTrailingArrowUpIntentParams {
  optionsOpen: boolean;
  optionCount: number;
  hasLastVisibleTarget: boolean;
  hasNavigateOut: boolean;
}

export function resolveTrailingArrowUpIntent(
  params: ResolveTrailingArrowUpIntentParams,
): TrailingArrowUpIntent {
  return resolveTrailingRowArrowUpIntent(params);
}

export type TrailingEscapeIntent = TrailingRowEscapeIntent;

export function resolveTrailingEscapeIntent(optionsOpen: boolean): TrailingEscapeIntent {
  return resolveTrailingRowEscapeIntent(optionsOpen);
}

export type TrailingEnterIntent = TrailingRowEnterIntent;

interface ResolveTrailingEnterIntentParams {
  optionsOpen: boolean;
  optionCount: number;
  hasText: boolean;
}

export function resolveTrailingEnterIntent(
  params: ResolveTrailingEnterIntentParams,
): TrailingEnterIntent {
  return resolveTrailingRowEnterIntent(params);
}
