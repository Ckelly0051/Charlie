import puppeteer from 'puppeteer';

// Standalone harnesses retain Puppeteer's launch behavior. Gate children share
// only the Chromium process, never pages, storage or browser contexts.
export function canShare(options = {}) {
  const allowed = new Set(['args', 'headless', 'protocolTimeout', 'defaultViewport']);
  return Object.keys(options).every(key => allowed.has(key))
    && (options.args || []).every(arg => arg === '--no-sandbox')
    && (options.headless == null || options.headless === true || options.headless === 'new');
}

async function launch(options = {}) {
  const endpoint = process.env.GIQ_TEST_BROWSER_ENDPOINT;
  if (!endpoint || !canShare(options)) return puppeteer.launch(options);
  const browser = await puppeteer.connect({ browserWSEndpoint: endpoint,
    ...(options.protocolTimeout != null ? { protocolTimeout: options.protocolTimeout } : {}),
    ...(options.defaultViewport !== undefined ? { defaultViewport: options.defaultViewport } : {}) });
  const contexts = new Set();
  const createContext = async options => {
    const context = await browser.createBrowserContext(options);
    contexts.add(context);
    return context;
  };
  let context;
  try { context = await createContext(); }
  catch (error) { await browser.disconnect(); throw error; }
  let closed = false;
  return {
    newPage: () => context.newPage(),
    createBrowserContext: createContext,
    async close() {
      if (closed) return;
      closed = true;
      try {
        for (const owned of contexts) if (!owned.closed) await owned.close();
      } finally { await browser.disconnect(); }
    },
  };
}

export default { launch };
