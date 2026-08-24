/** Compatibility entry point for the native Charting settings surface. */
export class TagLibrarySettings {
  static GROUPS = [
    { key: 'formation', label: 'Formations', singular: 'formation', placeholder: 'e.g. Trey' },
    { key: 'backfield', label: 'Backfields', singular: 'backfield', placeholder: 'e.g. Ace' },
    { key: 'front', label: 'Fronts', singular: 'front', placeholder: 'e.g. Bear' },
    { key: 'coverage', label: 'Coverages', singular: 'coverage call', placeholder: 'e.g. Cover 7' },
    { key: 'playType', label: 'Play Types', singular: 'play type', placeholder: 'e.g. Counter' },
    { key: 'blitz', label: 'Blitzes', singular: 'blitz', placeholder: 'e.g. Mike Plug' },
  ];

  constructor(customChips, tagger) {
    this.customChips = customChips;
    this.tagger = tagger;
    this.activeKey = 'formation';
  }

  open(group = null) {
    if (TagLibrarySettings.GROUPS.some(item => item.key === group)) this.activeKey = group;
    return window.app?.settingsScreen?.open?.({
      initialTab: 'charting',
      chartGroup: this.activeKey,
      returnFocus: document.activeElement,
    });
  }
}
