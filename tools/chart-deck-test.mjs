/** Data-workflow harnesses open the real section before driving its control.
 * Disclosure behavior itself is tested without this helper in deck-polish. */
export function chartDeckControls(page) {
  for (const method of ['click','focus','type']) {
    const original = page[method].bind(page);
    page[method] = async (selector, ...args) => {
      const section = await page.evaluate(selector => {
        const control = document.querySelector(selector);
        if (!control || control.matches('summary')) return null;
        const section = control.closest('.gi-tag-group');
        if (!section || section.open) return null;
        section.querySelector('summary').click();
        return section.dataset.section;
      }, selector);
      if (section) await page.waitForFunction(id => document.querySelector(`[data-section="${id}"]`)?.open, {}, section);
      return original(selector, ...args);
    };
  }
  return page;
}
