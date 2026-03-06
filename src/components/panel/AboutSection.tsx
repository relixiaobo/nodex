import { useCallback, useState } from 'react';
import { CHANGELOG, type ChangelogEntry } from '../../lib/changelog.js';
import { BulletChevron, ChevronButton } from '../outliner/BulletChevron';

const noop = () => {};

/** A static row — leaf node with no children. */
function LeafRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="group/row flex gap-1 min-h-6 items-start py-1" style={{ paddingLeft: 6 }}>
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
  text: string;
  description?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  isHeading?: boolean;
}) {
  return (
    <div>
      <div className="group/row flex gap-1 min-h-6 items-start py-1" style={{ paddingLeft: 6 }}>
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
        text="Think where you read"
        description={<><em>"Words can be like X-rays if you use them properly."</em> — Huxley</>}
        expanded={aboutExpanded}
        onToggle={useCallback(() => setAboutExpanded((v) => !v), [])}
        isHeading
      >
        <LeafRow>You read more than you realize. But most of it slips away — not because it wasn't good, but because you <strong className="font-semibold text-foreground">never stopped to put it in your own words</strong>.</LeafRow>
        <LeafRow>One sentence is enough. A reaction, a doubt, a connection to something you already know. <strong className="font-semibold text-foreground">That's where understanding begins.</strong></LeafRow>
        <LeafRow>Do this over weeks and months, and something shifts — your notes <strong className="font-semibold text-foreground">start connecting</strong>, patterns surface, and you begin to see <strong className="font-semibold text-foreground">what you actually think</strong>, not just what you've read.</LeafRow>
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
      text={`${entry.version} — ${entry.summary}`}
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
