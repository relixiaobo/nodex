import { type AppPanelId, APP_PANELS } from '../../types/index.js';
import { AboutSection } from './AboutSection';

const APP_PANEL_TITLES: Record<AppPanelId, string> = {
  [APP_PANELS.ABOUT]: 'About',
};

interface AppPanelProps {
  panelId: AppPanelId;
}

export function AppPanel({ panelId }: AppPanelProps) {
  const title = APP_PANEL_TITLES[panelId] ?? panelId;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto scroll-pb-[40vh] pt-12">
        {/* Header — matches NodeHeader layout */}
        <div className="ml-4 mb-2 px-2">
          <div className="flex items-center gap-1 min-h-7">
            <h1 className="text-[22px] font-semibold leading-8 text-foreground">{title}</h1>
          </div>
        </div>

        {/* Content */}
        {panelId === APP_PANELS.ABOUT && <AboutSection />}
      </div>
    </div>
  );
}
