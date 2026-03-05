import { ExternalLink, MessageSquare } from '../../lib/icons.js';
import { CHANGELOG } from '../../lib/changelog.js';

function getExtensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return CHANGELOG[0]?.version ?? '0.0.0';
  }
}

function ExternalLinkRow({ href, icon: Icon, label }: { href: string; icon: typeof ExternalLink; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 py-1.5 text-[15px] leading-6 text-foreground-secondary transition-colors hover:text-foreground"
    >
      <span className="shrink-0 w-[15px] flex items-center justify-center text-foreground-tertiary">
        <Icon size={12} />
      </span>
      <span>{label}</span>
      <ExternalLink size={10} className="text-foreground-tertiary" />
    </a>
  );
}

export function AboutSection() {
  const version = getExtensionVersion();

  return (
    <div className="ml-4 px-2 pb-4">
      {/* Product identity */}
      <div className="mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[18px] font-semibold leading-7 text-foreground">soma</span>
          <span className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-xs font-medium text-foreground-secondary">
            v{version}
          </span>
        </div>
        <p className="text-[13px] leading-5 text-foreground-tertiary">Think where you read</p>
      </div>

      <div className="border-t border-border-subtle" />

      {/* Changelog */}
      <div className="mt-3">
        {CHANGELOG.map((entry) => (
          <div key={entry.version} className="mb-3">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-[15px] font-medium leading-6 text-foreground">
                {entry.version}
              </span>
              <span className="text-xs text-foreground-tertiary">{entry.date}</span>
            </div>
            <ul className="ml-[15px] pl-2">
              {entry.items.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-[15px] leading-6 text-foreground-secondary"
                >
                  <span className="mt-[10px] h-1 w-1 shrink-0 rounded-full bg-foreground-tertiary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border-subtle" />

      {/* Links */}
      <div className="mt-2">
        <ExternalLinkRow
          href="https://tally.so/r/placeholder"
          icon={MessageSquare}
          label="Send Feedback"
        />
        <ExternalLinkRow
          href="https://github.com/relixiaobo/nodex"
          icon={ExternalLink}
          label="GitHub"
        />
      </div>
    </div>
  );
}
