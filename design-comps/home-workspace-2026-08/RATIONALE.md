# Home Workspace Concept

Historical first-pass direction. The later `../home-workspace-2026-08-31/`
comp owns the current Home implementation; preserve this earlier approved
concept as the roadmap's design-decision record, not as current pixel evidence.

Approved as the first-pass direction for Plan V2-B on 2026-08-22.

The Home screen has two explicit workspaces:

- **Our Program** for team seasons, our games, and self-scout.
- **Opponent Scout** for opponents, their games against other teams, and scout
  reporting.

`home.html` is interactive. The two PNG files capture each state at 1440x900.
The concept reuses the existing Opponent Scout perspective and analytics
backend; it does not authorize a second stats engine or duplicate persistence
model.

Coach-facing terminology must use **opponent** or **opponents**, never
"target."

The left navigation treatment shown here is not final. During implementation,
available destinations must gain obvious button-like hit areas and strong
hover, focus, and selected states so coaches can immediately recognize them as
clickable controls.
