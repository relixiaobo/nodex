/**
 * TriggerDropdowns — thin render component for the three trigger dropdown menus.
 *
 * Accepts the hook return from useEditorTriggers and renders TagSelector,
 * ReferenceSelector, and SlashCommandMenu when their respective triggers are active.
 */
import type { EditorTriggerState } from '../../hooks/use-editor-triggers.js';
import { TagSelector } from '../tags/TagSelector';
import { ReferenceSelector } from '../references/ReferenceSelector';
import { SlashCommandMenu } from './SlashCommandMenu';

interface TriggerDropdownsProps {
  triggers: EditorTriggerState;
  nodeId: string;
  tagIds: string[];
  visible: boolean;
}

export function TriggerDropdowns({ triggers, nodeId, tagIds, visible }: TriggerDropdownsProps) {
  if (!visible) return null;

  return (
    <>
      {triggers.hashTag.open && (
        <TagSelector
          ref={triggers.hashTag.tagDropdownRef}
          open={triggers.hashTag.open}
          onSelect={triggers.hashTag.onSelect}
          onCreateNew={triggers.hashTag.onCreateNew}
          existingTagIds={tagIds}
          query={triggers.hashTag.query}
          selectedIndex={triggers.hashTag.selectedIndex}
          anchor={triggers.hashTag.anchor}
        />
      )}
      {triggers.reference.open && (
        <ReferenceSelector
          ref={triggers.reference.refDropdownRef}
          open={triggers.reference.open}
          onSelect={triggers.reference.onSelect}
          onCreateNew={triggers.reference.onCreateNew}
          query={triggers.reference.query}
          selectedIndex={triggers.reference.selectedIndex}
          currentNodeId={nodeId}
          treeReferenceParentId={triggers.reference.treeContextParentId}
          anchor={triggers.reference.anchor}
        />
      )}
      {triggers.slash.open && (
        <SlashCommandMenu
          open={triggers.slash.open}
          commands={triggers.slash.filteredCommands}
          selectedIndex={triggers.slash.selectedIndex}
          onSelect={triggers.slash.executeCommand}
          anchor={triggers.slash.anchor}
        />
      )}
    </>
  );
}
