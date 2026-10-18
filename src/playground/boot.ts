/**
 * THE ENTRY POINT. The game (`main.ts`) is loaded only in the tab that holds the game lock (`single-tab.ts`), so a
 * second tab can never save over the first one's island; it says so and starts by itself once the other tab closes.
 */
import { claimTab, type TabLocks } from '../game/single-tab';

const app = document.getElementById('app')!;

void claimTab({
  locks: (globalThis.navigator as Navigator | undefined)?.locks as TabLocks | undefined,
  win: window,
  start: () => {
    app.innerHTML = '';
    void import('./main');
  },
  waiting: () => {
    app.innerHTML = `<div class="tab-wait" role="status"><p><b>Blobbi Pixel is already open in another tab.</b></p><p>Your island can only be played in one tab at a time, so neither tab saves over the other. Close the other tab and this one starts by itself.</p></div>`;
  },
});
