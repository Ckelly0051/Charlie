import { render } from 'preact';

function NativeRoot() {
  return null;
}

const host = document.getElementById('giNativeRoot');
if (host) render(<NativeRoot />, host);
