/** Apply beta-only desktop defaults once per beta version, while preserving
 *  later coach choices. One key holds the version the defaults were applied
 *  for. */
export function configureBetaDefaults(storage, isDesktop, version) {
  if (!isDesktop || !/-\d+$/.test(String(version))) return false;
  try {
    if (storage.getItem('ffa_beta_defaults') === String(version)) return false;
    storage.setItem('ffa_sql_catalog', '1');
    storage.setItem('ffa_beta_defaults', String(version));
    return true;
  } catch {
    return false;
  }
}