import { TavieTabs } from '@/components/tabs';
import { SelectedProgramProvider } from '@/lib/selected-program';
import { CREATOR_TABS } from '@/lib/navigation';

/** Overview, Students, Programs. The builder screens open above these, full screen. */
export default function CreatorTabs() {
  return (
    <SelectedProgramProvider>
      <TavieTabs tabs={CREATOR_TABS} />
    </SelectedProgramProvider>
  );
}
