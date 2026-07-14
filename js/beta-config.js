/** Apply beta-only desktop defaults once, while preserving later coach choices. */
export function configureBetaDefaults(storage, isDesktop, version) {
  if (!isDesktop || !/-\d+$/.test(String(version))) return false;
  const marker = `ffa_beta_defaults_${version}`;
  try {
    if (storage.getItem(marker) === '1') return false;
    storage.setItem('ffa_workspace_shell_v2', '1');
    storage.setItem('ffa_breakdown_form_v2', '1');
    storage.setItem('ffa_sql_catalog', '1');
    storage.setItem(marker, '1');
    return true;
  } catch {
    return false;
  }
}
