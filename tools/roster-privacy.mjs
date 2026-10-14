import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CANONICAL_SEASON } from './canonical-season.mjs';
export const repoRoot=fileURLToPath(new URL('..',import.meta.url));
export function privateRoster() {
  // Missing private input is a failure, never an empty or skipped privacy check.
  return JSON.parse(readFileSync(process.env.GIQ_PRIVATE_ROSTER || CANONICAL_SEASON,'utf8')).roster;
}
export const containsRealRosterName=(text,roster) => roster.some(player=>player.name && text.includes(player.name));
export function trackedNameLeaks(roster=privateRoster(), revision) {
  const directory=mkdtempSync(resolve(tmpdir(),'gi-private-name-check-'));
  const patterns=resolve(directory,'patterns.txt');
  try {
    writeFileSync(patterns,roster.map(player=>player.name).filter(Boolean).join('\n')+'\n');
    try {
      return execFileSync('git',['grep','-l','-F','-f',patterns,...(revision?[revision]:[]),'--'],
        {cwd:repoRoot,encoding:'utf8',maxBuffer:8*1024*1024}).trim().split('\n').filter(Boolean);
    } catch(error) {if(error.status===1)return [];throw error;}
  } finally {unlinkSync(patterns);rmdirSync(directory);}
}
