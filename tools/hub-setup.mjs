/**
 * Shared first-run setup for browser harnesses.
 *
 * S7-c deleted the legacy SeasonLibrary overlay, and with it the
 * `#teamSetupName` / `#btnTeamSetupSave` / `#btnExploreDemo` controls that
 * seven harnesses used to reach a usable app. They now drive the NATIVE Team
 * Hub, which is what a coach actually uses.
 *
 * One implementation on purpose: seven inline copies of a setup flow drift, and
 * a harness that silently stops reaching the real first-run path is worse than
 * one that fails loudly.
 */

/** Open the Team Hub and create the first team. Resolves once the hub reloads. */
export async function createFirstTeam(page, teamName = 'Mavericks', color = 'navy') {
  // Some harnesses boot straight onto the hub and some start on Home, so only
  // navigate when the setup form is not already on screen.
  const alreadyThere = await page.evaluate(() => !!document.querySelector('[data-first-launch]'));
  if (!alreadyThere) {
    await page.evaluate(() => {
      const seasons = document.querySelector('[data-ws-action="seasons"]');
      if (seasons) seasons.click();
      else window.app?.workspaceShell?._openLibrary?.();
    });
  }
  // School/nickname are separate fields (2026-08-31 Home naming contract);
  // typing the whole label into school (nickname left blank) composes the
  // resulting teamName === teamName, unchanged for every caller here.
  await page.waitForSelector('[data-first-launch] input[name="school"]', { timeout: 15000 });
  await page.type('[data-first-launch] input[name="school"]', teamName);
  if (color) { try { await page.select('[data-first-launch] select[name="jerseyColor"]', color); } catch (e) {} }
  await page.click('[data-first-launch] [role="radio"][aria-checked="false"]');
  await page.click('[data-first-launch] .ws-primary');
  await page.waitForFunction(() => !document.querySelector('[data-first-launch]'), { timeout: 15000 });
}

/** Load the sample season through the Team Hub's own action. */
export async function exploreSampleSeason(page) {
  await page.evaluate(() => window.app?.workspaceShell?._openLibrary?.());
  await page.waitForFunction(() => [...document.querySelectorAll('.gi-hub-section-head button')]
    .some(b => /sample season/i.test(b.textContent)), { timeout: 15000 });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('.gi-hub-section-head button')]
      .find(b => /sample season/i.test(b.textContent));
    button?.click();
  });
  await page.waitForFunction(() => !!window.app?.storage?.seasonStore?.hasCurrent?.(), { timeout: 20000 });
}

/** The common case: a team plus the sample season, ready to chart. */
export async function setupTeamAndDemo(page, teamName = 'Mavericks') {
  await createFirstTeam(page, teamName);
  await exploreSampleSeason(page);
}
