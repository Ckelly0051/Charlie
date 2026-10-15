export async function reportReady(page, tab, board) {
  await page.bringToFront();
  await page.waitForFunction(({ tab, board }) => {
    const app = window.app, node = document.querySelector(board);
    return app?.workspaceShell?.root?.dataset.route === 'reports'
      && app.reportsScreen.activeTab === tab && node?.getClientRects().length
      && document.fonts.status === 'loaded';
  }, {}, { tab, board });
  await reportFrame(page);
}

export async function reportFrame(page) {
  await page.bringToFront();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

// Runs in the page: table-layout:fixed can clip text without scroll overflow.
export function clippedTableText({ selector, allowTitledEllipsis = false, maxLabel = 30 }) {
  return [...document.querySelectorAll(selector)].filter(cell => {
    if (!cell.getClientRects().length) return false;
    const range = document.createRange(); range.selectNodeContents(cell);
    const style = getComputedStyle(cell);
    const innerWidth = cell.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (range.getBoundingClientRect().width - innerWidth <= 1) return false;
    const child = cell.firstElementChild;
    if (allowTitledEllipsis && cell.childElementCount === 1 && child) {
      const childStyle = getComputedStyle(child);
      if (childStyle.textOverflow === 'ellipsis' && childStyle.overflow !== 'visible' && child.getAttribute('title')?.trim()) return false;
    }
    return true;
  }).map(cell => cell.textContent.trim().slice(0, maxLabel));
}
