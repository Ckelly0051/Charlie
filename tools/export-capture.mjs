/** Test-only interception of the injected save owners; no production globals. */
export async function installExportCapture(page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(window, '__exportCapture', {
      get() { return window.app.saveBlob; },
      set(saveBlob) {
        const app = window.app;
        app.saveBlob = saveBlob;
        const owners = [app.storage, app.storage?.seasonStore, app.season,
          app.planScreen, app.reportsScreen, app.reportsScreen?.dashboards, app.cutup];
        for (const owner of owners) if (owner) owner.saveBlob = saveBlob;
      },
    });
  });
}
