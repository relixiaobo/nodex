import { GlobalTools } from '../toolbar/TopToolbar.js';
import { PanelLayout } from '../panel/PanelLayout.js';

export function DeskLayout() {
  return (
    <div className="flex flex-1 overflow-hidden p-1.5">
      <PanelLayout toolbar={<GlobalTools />} />
    </div>
  );
}
