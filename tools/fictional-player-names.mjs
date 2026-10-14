/** Public artifacts use these identities; real roster data stays external. */
export const FICTIONAL_PLAYERS = Object.freeze({
  '2':'Evan Brooks','3':'Lucas Reed','5':'Noah Hayes','6':'Owen Fletcher',
  '7':'Mason Carter','15':'Caleb Turner','16':'Finn Parker','18':'Wyatt Sullivan',
  '25':'Miles Bennett','27':'Graham Ellis','40':'Cole Warren','42':'Nolan Pierce',
  '45':'Silas Mercer','59':'Jack Lawson','81':'Aiden Foster','82':'Eli Dawson',
  '88':'Theo Ramsey','92':'Henry Archer','99':'Logan Spencer',
});
export const fictionalRoster = roster => roster.map(player => ({...player,
  name:FICTIONAL_PLAYERS[String(player.num)] || `Player ${player.num}`}));
export function redactRosterNames(text, roster) {
  for (const player of roster) if (player.name) text=text.replaceAll(player.name,
    FICTIONAL_PLAYERS[String(player.num)] || `Player ${player.num}`);
  return text;
}
