export function FilmEmpty({ desktop, onFile, onFolder, onLink }) {
  return <div class="dropzone-card">
    <svg class="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M3 7.5h4M3 12h18M3 16.5h4M17 3v18M17 7.5h4M17 16.5h4"/></svg>
    <div class="dropzone-title" id="dropzoneTitle">Add game film</div>
    <p class="dropzone-status" id="videoPlaceholderStatus" hidden/>
    <div class="dropzone-actions"><button class="btn btn-accent" type="button" data-action="file" onClick={onFile}>Add Video</button><button class="btn btn-secondary" type="button" data-action="folder" onClick={onFolder}>Add Folder</button>{desktop && <button class="btn btn-secondary" type="button" data-action="link" onClick={onLink}>Link Existing Folder</button>}</div>
    <div class="empty-hint">{desktop ? 'Link references clips in your own folder \u2014 no copy. ' : ''}or drop a video or folder here</div>
  </div>;
}

export function FilmLoadedHint({ close }) {
  return <div class="onboard-hint-body"><strong>Ready to tag:</strong>{' Play 1 was created for this film \u2014 tap the chips in the tag form to chart it. (For one continuous game video, use '}<b>[</b> and <b>]</b>{" to mark each play's start/end.) "}<button class="onboard-close" onClick={close}>Got it</button></div>;
}
