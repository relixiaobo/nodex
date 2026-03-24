import { useCallback, useState } from 'react';
import { CHANGELOG, type ChangelogEntry } from '../../lib/changelog.js';
import { BulletChevron, ChevronButton } from '../outliner/BulletChevron';

const noop = () => {};

/** A static row — leaf node with no children. */
function LeafRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="group/row flex gap-1 min-h-6 items-start" style={{ paddingLeft: 6 }}>
      <ChevronButton isExpanded={false} onToggle={noop} onDrillDown={noop} />
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={noop} />
        <span className={`flex-1 min-w-0 text-[15px] leading-6 ${className ?? 'text-foreground-secondary'}`}>{children}</span>
      </div>
    </div>
  );
}

/** A collapsible row — parent node with children. */
function ParentRow({
  text,
  description,
  expanded,
  onToggle,
  children,
  isHeading,
}: {
  text: React.ReactNode;
  description?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  isHeading?: boolean;
}) {
  return (
    <div>
      <div className="group/row flex gap-1 min-h-6 items-start" style={{ paddingLeft: 6 }}>
        <ChevronButton isExpanded={expanded} onToggle={onToggle} onDrillDown={noop} />
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <BulletChevron hasChildren isExpanded={expanded} onBulletClick={noop} />
          <div className="flex-1 min-w-0">
            <div className={isHeading ? 'text-[1.125em] font-bold leading-6 text-foreground' : 'text-[15px] leading-6 text-foreground'}>{text}</div>
            {description && (
              <div className="text-xs leading-[15px] text-foreground-tertiary">{description}</div>
            )}
          </div>
        </div>
      </div>
      {expanded && <div style={{ paddingLeft: 28 }}>{children}</div>}
    </div>
  );
}

export function AboutSection() {
  const [aboutExpanded, setAboutExpanded] = useState(true);
  const [whatsNewExpanded, setWhatsNewExpanded] = useState(true);

  return (
    <div className="flex flex-col pr-4 pb-4">
      {/* About soma */}
      <ParentRow
        text="Notes that think with you"
        description={<><em>"The test of a first-rate intelligence is the ability to hold two opposed ideas in mind at the same time and still retain the ability to function."</em> — Fitzgerald</>}
        expanded={aboutExpanded}
        onToggle={useCallback(() => setAboutExpanded((v) => !v), [])}
        isHeading
      >
        <LeafRow>soma is your <strong className="font-semibold text-foreground">thinking partner</strong>. It challenges your ideas, questions your assumptions, and connects what you know — so you see more clearly.</LeafRow>
        <LeafRow>Record a thought, and soma searches your knowledge graph for <strong className="font-semibold text-foreground">contradictions, patterns, and unexpected connections</strong>. If it finds something worth thinking about, it tells you. If not, it stays quiet.</LeafRow>
        <LeafRow>Over time, your conversations and notes <strong className="font-semibold text-foreground">become a shared memory</strong> that makes every future conversation deeper. soma grows with you — it remembers what you discussed, learns how you think, and evolves as you do.</LeafRow>
      </ParentRow>

      {/* What's New */}
      <ParentRow
        text="What's New"
        expanded={whatsNewExpanded}
        onToggle={useCallback(() => setWhatsNewExpanded((v) => !v), [])}
        isHeading
      >
        {CHANGELOG.map((entry, i) => (
          <VersionNode key={entry.version} entry={entry} defaultExpanded={i === 0} />
        ))}
      </ParentRow>
    </div>
  );
}

function VersionNode({ entry, defaultExpanded }: { entry: ChangelogEntry; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  return (
    <ParentRow
      text={<><strong className="font-semibold">{entry.version}</strong>: {entry.summary}</>}
      description={entry.date}
      expanded={expanded}
      onToggle={toggle}
    >
      {entry.items.map((item) => (
        <LeafRow key={item}>{item}</LeafRow>
      ))}
    </ParentRow>
  );
}
