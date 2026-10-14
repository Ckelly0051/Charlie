/** Contextual entry point for the native Charting settings surface. */
export class TagLibrarySettings {
  static GROUPS = [
    { key: 'formationFamily', label: 'Formations', singular: 'formation', placeholder: 'e.g. Tight Bunch' },
    { key: 'backfield', label: 'Backfields', singular: 'backfield', placeholder: 'e.g. Ace' },
    { key: 'front', label: 'Fronts', singular: 'front', placeholder: 'e.g. Bear' },
    { key: 'coverage', label: 'Coverages', singular: 'coverage call', placeholder: 'e.g. Cover 7' },
    { key: 'playType', label: 'Play Types', singular: 'play type', placeholder: 'e.g. Counter' },
    { key: 'blitz', label: 'Blitzes', singular: 'blitz', placeholder: 'e.g. Mike Plug' },
    { key: 'receiverRoute', label: 'Receiver Routes', singular: 'receiver route', placeholder: '' },
  ];

  constructor(customChips, tagger, openSettings) {
    this.customChips = customChips;
    this.tagger = tagger;
    this.openSettings = openSettings;
    this.activeKey = 'formationFamily';
  }

  open(group = null) {
    if (TagLibrarySettings.GROUPS.some(item => item.key === group)) this.activeKey = group;
    return this.openSettings?.({
      initialTab: 'charting',
      chartGroup: this.activeKey,
      returnFocus: document.activeElement,
    });
  }
}
