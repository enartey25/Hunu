import { DEFAULT_COMPANY_PROFILE } from '../storage/companyStore';
import { listWatches } from '../engine/fareWatch';

// --- Watched routes ----------------------------------------------------------------
// Hunu's API re-checks watched routes each morning. Twice a day the extension asks for
// them and shows one notification per fall it has not shown before.
const FARE_ALARM = 'hunu-fare-watch';
const SEEN_KEY = 'hunu_fare_drops_seen';

// Created once; recreating on every service-worker wake would keep resetting the clock.
chrome.alarms?.get(FARE_ALARM).then((existing) => {
  if (!existing) chrome.alarms.create(FARE_ALARM, { periodInMinutes: 12 * 60, delayInMinutes: 1 });
});

chrome.alarms?.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== FARE_ALARM) return;
  try {
    const watches = await listWatches();
    const seen = ((await chrome.storage.local.get(SEEN_KEY))[SEEN_KEY] || {}) as Record<string, string>;
    for (const w of watches) {
      if (!w.droppedAt || w.lastPrice === null || seen[w.id] === w.droppedAt) continue;
      seen[w.id] = w.droppedAt;
      const was = w.previousPrice !== null ? ` (was GH₵ ${Math.round(w.previousPrice).toLocaleString('en-US')})` : '';
      chrome.notifications?.create(`hunu-fare-${w.id}`, {
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: `${w.label || `${w.origin} → ${w.destination}`} is cheaper`,
        message: `Now GH₵ ${Math.round(w.lastPrice).toLocaleString('en-US')}${was}${w.date ? `, ${w.date}` : ''}. Open Hunu to see the fares.`
      });
    }
    await chrome.storage.local.set({ [SEEN_KEY]: seen });
  } catch (err) {
    console.warn('[Hunu] Fare watch check failed:', err);
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Hunu] Service worker initialized. Reason:', details.reason);

  // Set default profile if not present
  try {
    const existing = await chrome.storage.sync.get('hunu_company_profile');
    if (!existing || !existing.hunu_company_profile) {
      await chrome.storage.sync.set({ hunu_company_profile: DEFAULT_COMPANY_PROFILE });
    }
  } catch (err) {
    console.error('[Hunu] Storage initialization error:', err);
  }

  // Context menu: look up the selected product
  if (chrome.contextMenus) {
    chrome.contextMenus.create({
      id: 'hunu-search-selection',
      title: 'Find the best deal for "%s" with Hunu',
      contexts: ['selection']
    });
  }

  // Configure Side Panel to be available
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  }
});

// Handle Context Menu clicks
chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'hunu-search-selection' && tab?.id) {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  }
});

// Handle cross-context messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'HUNU_OPEN_SIDEPANEL' || message.type === 'HUNU_OPEN_SIDEPANEL_COMPARE') {
    if (message.deal) {
      chrome.storage.local.set({ hunu_active_page_deal: message.deal });
    }
    if (sender.tab?.id && chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ tabId: sender.tab.id });
      sendResponse({ success: true });
    }
    return true;
  }
});

