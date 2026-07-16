# MOWC Keeper Guide

Welcome, Keeper. MOWC is your assistant for running *Monster of the Week*. This guide covers campaign setup, preparing mysteries, running sessions, and everything in between.

## Campaign Setup

### Create a Campaign

Log in and click "New Campaign" under "My Campaigns." Give it a name (e.g., "The Seaside Mystery") and optional description. You own the campaign and start with all permission to edit everything.

### Invite Hunters

From your campaign page, open the "Invites" panel. Click "Generate Code" to create a single-use invitation code with a 7-day expiry. Share this code with your players (e.g., over Discord or email). Each code gives one hunter a seat at your table.

Once a player joins, they appear in the campaign's hunters list. You can see their character sheet at any time by clicking their name.

## Content Packs

Content packs define the playbooks, moves, gear, and monsters available in your campaign. MOWC ships with no bundled content (to respect Evil Hat's copyright), so you must load packs before your campaign is playable.

### Load a Pack from File

1. Go to the Packs page and click "Add Pack" (or "Import" if you have a `.mowcpack.json` file).
2. Select a `.mowcpack.json` file from your computer.
3. Review the pack details and click "Import."

The pack is now available in this campaign. Hunters building characters will see its playbooks.

### Build a Pack from Scratch

1. Go to Packs and click "Create New Pack."
2. Name your pack (e.g., "Homebrew Expanded Moves").
3. Add playbooks by clicking "Add Playbook" and filling in:
   - **Name**: The playbook's name.
   - **Description**: A short description of who this playbook is for.
   - **Ratings line**: Five ratings (Charm, Cool, Sharp, Tough, Weird) and their starting values. Example: "Charm -1, Cool +2, Sharp 0, Tough +1, Weird +1."
   - **Looks**: 2-3 appearance options for hunters of this playbook.
   - **Moves**: Custom moves with their trigger and outcome text. You can mark one or more as basic moves (automatically given to all hunters).
   - **Gear**: Starting gear options with brief descriptions.
   - **Improvements**: Improvements players can take when they level up. Optionally mark some as "advanced" (only available after all basic improvements are taken).
4. Once you've added playbooks, save the pack.

The pack is available in your campaign immediately and exported as a `.mowcpack.json` file for sharing or backup.

### Convert a PDF Rulebook to a Pack (Admin Feature)

If you are an admin (contact the project maintainer), you can upload a Monster of the Week rulebook PDF or playbook PDF, and MOWC will extract its text and generate draft packs.

1. Go to Packs and click "Convert PDF" (only visible if you're an admin).
2. Upload a PDF file.
3. MOWC extracts the text and generates one draft pack per playbook or section it finds, plus a reference draft with universal moves and Keeper reference material.
4. Review each draft. MOWC will flag uncertain parts with "Conversion notes" inline with the fields they affect (e.g., if a move's trigger text is ambiguous, you'll see a flag next to that move).
5. Edit drafts as needed (exact same editor as "Build from Scratch").
6. Click "Save" to finalize a draft as a real pack, or "Discard" to skip it.

Conversion is conservative by design: MOWC flags uncertainties rather than guesses, so you have a chance to correct them before saving.

## Mysteries, Locations, and Opposition

### Build a Mystery

Mysteries are your adventure outlines. Before each session, build the mystery your hunters will investigate.

1. From your campaign page, click "New Mystery" or open the Keeper dashboard.
2. Fill in:
   - **Name**: The mystery's name or title.
   - **Concept**: A one-sentence hook (e.g., "A lake monster is attacking swimmers").
   - **Hook**: How the hunters learn about this mystery.
   - **Countdown**: A clock from 1 to 12 steps that represents the mystery's escalation. Name each step (e.g., "Monster spotted twice," "Power plant sabotaged," "Hunters are framed," "Monster feeds"). You advance the clock during play as things get worse.
   - **Locations**: Places the hunters might visit (e.g., "The Lake," "The Ranger Station," "The Abandoned Lab"). Add a brief description and any details that might matter.
   - **Cast**: The NPCs and monsters involved (see sections below).

### Create Monsters

Monsters are the main threat in a mystery.

1. From the mystery or campaign page, click "New Monster."
2. Fill in:
   - **Name**: The creature's name or type.
   - **Type**: What kind of monster (e.g., "Lake Monster," "Vampire," "Poltergeist"). Pick from your loaded packs' monster types if available.
   - **Motivation**: Why it's here and what it wants (e.g., "to feed on fresh prey").
   - **Powers**: Special abilities (e.g., "Breathes fire," "Invisible in darkness," "Heals from electricity").
   - **Weaknesses**: How to hurt or stop it (e.g., "Killed by silver bullets," "Afraid of holy water").
   - **Attacks**: What it does when it fights. List each attack with its harm value and tags (e.g., "Bite: 2-Harm, messy").
   - **Armor**: Does it have natural protection? (e.g., "1-Armor from scales").
   - **Harm capacity**: How much Harm it can take before it's dead (e.g., "8-Harm").
   - **Custom moves**: Any monster-specific rules (e.g., "Regenerates 1-Harm at the start of each round").

### Create Minions and Bystanders

Minions are lesser threats; bystanders are NPCs.

**Minion** (e.g., a zombie, a cultist):
- **Name/Type**: What it is.
- **Powers**: Any special abilities.
- **Attacks**: What it does in combat.
- **Harm capacity**: Usually 2-4 Harm.

**Bystander** (e.g., a witness, a concerned citizen, the victim's friend):
- **Name and role**: Who they are and what they do.
- **Description**: How they look and act.
- **Agenda**: What they want or are trying to do (e.g., "Wants to warn others," "Hiding a secret").
- **Custom moves**: Any special abilities or resources they have.

## Running Sessions

### Session Mode

When it's time to play, go to your campaign's session view:

1. From the campaign page, click "Start Session" or "Continue Session" (if you've already begun).
2. You'll see your hunters' character sheets, the countdown for the active mystery, and session controls.

During play, you and your hunters are in the same "session" — all of you see revealed information in real time (if online) or sync when you reconnect (if offline).

### Revealing Information

When hunters learn something:

1. Click on the relevant entity (a location, monster, clue, etc.).
2. Mark it "Revealed to Hunters." It now appears on their screens (or syncs when they come online).

The players see what you choose to reveal, nothing more. This keeps the mystery intact.

### Advancing the Countdown

As things go wrong or escalate:

1. During the session, click the countdown clock for your mystery.
2. Click the next step to advance it. Add a brief description of what happens (e.g., "The monster attacks the police station").
3. The step is now marked complete. Hunters see this change in real time or on their next sync.

### Marking Harm

When a monster attacks a hunter:

1. Click the hunter's character sheet in the session view.
2. Mark the Harm track (or tell the hunter directly if they're controlling their own sheet).

If a hunter reaches the "unstable" threshold (marked on the Harm track), they enter an unstable state. They must take an improvement at the next opportunity to clear it.

### Combat and Rolls

Hunters make their own rolls on their character sheets. You can see the results in the session log or ask them what they rolled. If you need to roll for a monster attack, use the app's dice roller (click "Roll" from the monster's stat block) or use real dice and type the result into notes.

### Notes and Session Log

The session log is a timestamped record of all changes in the campaign (rolls, Harm marked, mysteries revealed, etc.). You can export this as a markdown file for reference or to share with your group later.

Use the Notes field on any entity to keep track of small details (e.g., "The witness is lying," "This clue connects to the subplot").

## Keeper Dashboard

Your Keeper dashboard is your command center:

- **Campaign overview**: Name, current session status, hunters' status (Harm, Luck, etc.).
- **Mysteries**: List of active mysteries with their countdown status and cast.
- **Session prep**: A view of your mystery, locations, and opposition before the session starts.
- **Sharing and visibility controls**: Toggle which entities are revealed to hunters.

Use the dashboard between sessions to plan and update your mystery details.

## Offline Play

MOWC works offline. During a session without internet:

- You can still advance the countdown, reveal information, and mark Harm.
- Hunters can still roll dice and edit their characters.
- All changes save to your device and sync when you reconnect.

When you come back online, all changes automatically sync. Hunters see updates appear on their screens.

## Export and Backup

### Export a Campaign

From your campaign page, click "Export." MOWC creates a JSON file with your campaign, all characters, mysteries, and content packs. Use this to:

- Back up your campaign.
- Share it with another Keeper.
- Migrate to a different server or installation.

### Export a Session Log

After a session, go to the session view and click "Export Log." MOWC creates a markdown file with the full timestamped log of everything that happened (rolls, reveals, Harm, etc.). You can edit it, share it with your group, or keep it as a record.

## Tips for Keepers

- **Prepare, but stay flexible.** Build your mystery's structure (concept, locations, cast, countdown), but let hunters' choices drive the story. They'll surprise you.
- **Ask what they do.** When a hunter tries something, ask clarifying questions before deciding whether a roll is needed.
- **Make the countdown matter.** Advance it when things go wrong or time runs out. The hunters should feel like they're racing against escalation.
- **Reveal strategically.** Don't show hunters the full monster stat block until they've learned something about it. Let clues accumulate.
- **Use notes.** Mark down what you know and when hunters learn it. The Notes field is perfect for this.
- **Test features offline.** Before a session, make sure your internet is stable, or accept that you might be offline. The app handles both gracefully.

## Troubleshooting

**Hunters can't see the content I revealed.** Make sure you marked it "Revealed to Hunters." If you're offline, they'll see it when they sync.

**I accidentally marked a mystery step complete.** Click the countdown to open it; you can click an earlier step to revert (though this will undo any changes to that step).

**A hunter can't build a character.** Make sure you've loaded at least one content pack into the campaign. Packs define playbooks.

**Changes aren't syncing in real time.** If you or a hunter is offline, changes will sync when you reconnect. Check the sync status badge.

**I want to edit a hunter's character sheet for them.** Navigate to their character sheet and make the edits directly. They'll see the changes on their device (or when they sync if offline).

**How do I delete a campaign?** From "My Campaigns," click the campaign, then click "Delete Campaign" (you must own it). This is permanent.

## Advanced: Multi-Table Play

If you're running multiple campaigns or sharing Keepers with other groups, each campaign is independent. Players in different campaigns see different campaigns in their list. Use the same content packs across multiple campaigns to keep playbooks consistent.
