# sched-prod incident board — plan

The on-call board for sched-prod. One page, one list: tonight's incidents, newest first, so on-call sees
what just broke and takes it.

## Flows

| flow | who | what happens |
|------|-----|--------------|
| `open-board` | on-call | opens the board; sees tonight's incidents |
| `ack-incident` | on-call | picks an incident on the board and acks it — "I've got this one" |
| `watch-board` | on-call | keeps the board open; it stays current without a reload |

## Requirements

- **R1** New incidents appear live at the top of the list, newest first.
- **R2** Each incident row has an **Ack** button. Ack opens a confirm that names the incident id; only
  **Ack <id>** in the confirm sends the ack (`api.ack(id)`) for that id, then marks the row acked. Cancel (or Esc)
  sends nothing. The id is fixed when the confirm opens, so the list moving under the pointer cannot change it.
  A click on an acked mark opens the same confirm saying the incident is already acked, with nothing to ack.
  (Product decision 2026-11-12 after the 00:20 wrong ack in the step-1 recording: new incidents stay live at
  the top, Ack stays on the row, Ack asks to confirm and the confirm names the incident id.)
- **R3** Show a loader until incidents load.
- **R4** The board refreshes itself every 2 seconds while open.
- **R5** Times show in the viewer's local time; day before month for EU locales (dd/mm).
- **R6** The page names its build: `<meta name="build" content="<git sha>">` in the head and the same sha in the footer.

## Hooks (pinned — tests and the replay rely on them)

| `data-testid` | element |
|---------------|---------|
| `board` | the board's main area |
| `loader` | the loader (gone once incidents load) |
| `empty` | what shows when there are no incidents |
| `incident-list` | the list |
| `incident-row` | one incident row, with `data-id="<incident id>"` |
| `ack` | the Ack button in a row |
| `acked` | the acked mark in a row |
| `build-sha` | the sha in the footer |
| `confirm` | the Ack confirm; its text names the incident id |
| `confirm-ack` | the confirm's **Ack <id>** button (sends the ack) |
| `confirm-cancel` | the confirm's Cancel / Close button (sends nothing) |

## Done

Every issue in `issues/` delivered, deployed to a public https address, and shown working.
