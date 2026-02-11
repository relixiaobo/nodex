# Nodex Manual Test Checklist

Items that require human verification (browser interaction limitations prevent automated testing).

## BulletChevron Layout & Hover Behavior (vs Tana)

Chevron and Bullet are TWO INDEPENDENT side-by-side areas: `[Chevron 15px] [Bullet 15px]`

- [ ] **Layout**: Chevron area is to the LEFT of bullet, they don't overlap
- [ ] **Leaf node hover**: Hover over a leaf node - chevron `>` appears in LEFT area, bullet stays visible in RIGHT area
- [ ] **Parent node (collapsed) hover**: Hover over a collapsed parent - chevron `>` appears, bullet stays visible
- [ ] **Parent node (expanded) hover**: Hover over an expanded parent - chevron `v` (rotated) appears, bullet stays visible
- [ ] **Mouse away from expanded node**: Move mouse away - chevron disappears, bullet remains, children still shown
- [ ] **Mouse away from leaf node**: Move mouse away - chevron disappears, bullet returns
- [ ] **Click chevron on leaf**: Click the chevron on a leaf node - should expand + create empty child with editor focused
- [ ] **Click chevron on parent (collapsed)**: Click chevron - should expand and show children
- [ ] **Click chevron on parent (expanded)**: Click chevron - should collapse and hide children
- [ ] **Double-click chevron**: Double-click on a parent node - should drill-down (push panel)

## Bullet Size/Style & Click Behavior

- [ ] **Leaf node bullet**: 5px inner dot, no outer ring (transparent background)
- [ ] **Parent node bullet (collapsed)**: 5px inner dot + 15px outer ring (dimmed background, `bg-foreground/10`)
- [ ] **Parent node bullet (expanded)**: 5px inner dot, no outer ring (transparent background, same as leaf)
- [ ] **Bullet click → zoom in**: Click any bullet - should push panel (drill-down to that node)
- [ ] **Bullet hover**: Hover over bullet - inner dot scales up slightly
- [ ] **Bullet active**: Press down on bullet - scales down slightly (0.9x)

## Indent Guide Line (Clickable)

- [ ] **Expanded node has guide line**: Vertical 1px line under expanded node, aligns with parent bullet center
- [ ] **Guide line spans all children**: Line extends from first child to last child
- [ ] **Nested guide lines**: Multiple levels of nesting each show their own guide line
- [ ] **Collapsed node has no guide line**: Guide line disappears when node is collapsed
- [ ] **Click guide line (expand-all)**: Click indent line when no children expanded - expands all direct children
- [ ] **Click guide line (collapse-all)**: Click indent line when any child expanded - collapses all direct children
- [ ] **Guide line hover**: Hover over guide line - line color becomes darker

## Keyboard Navigation (ProseMirror cannot be tested with synthetic events)

- [ ] **Enter**: Creates a sibling node below current
- [ ] **Tab**: Indents node (becomes child of previous sibling)
- [ ] **Shift+Tab**: Outdents node (moves to grandparent level)
- [ ] **Backspace on empty node**: Deletes the empty node, focuses previous
- [ ] **Arrow Up/Down**: Moves focus between visible nodes
- [ ] **Cmd+Shift+Up/Down**: Reorders node up/down within siblings

## Edge Case: Container Outdent Guard

- [ ] **Outdent at container level**: Try Shift+Tab on a top-level node in Library - should be no-op (node stays in Library)

## Drag and Drop

- [ ] **Drag before**: Drag a node above another - drop indicator line appears above
- [ ] **Drag after**: Drag below - drop indicator line appears below
- [ ] **Drag inside**: Drag into middle of node - node highlights, becomes child
- [ ] **Cross-level drag**: Drag from one nesting level to another
