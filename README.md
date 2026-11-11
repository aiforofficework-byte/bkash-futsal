# Futsal Tournament — Manual Lottery & Live Draw System

A complete, offline, browser-based draw system for a 32-team / 16-match futsal
tournament. Pure **HTML5 + CSS3 + vanilla JavaScript** — no backend, no build
step, no framework.

Three screens that stay in sync in real time:

| # | File | Role |
|---|------|------|
| 01 | `index.html` | Team management + manual lottery control panel (operator) |
| 02 | `live-result.html` | One enlarged match card, live on the big screen |
| 03 | `draw-board.html` | The complete 16-match draw board |
| 04 | `bracket.html` | Full tournament bracket, First Round through the Final |

---

## 1. How to run it

The screens talk to each other and read the `/LOGO` folder, so they must be
served over **http://**, not opened as `file://`.

### VS Code Live Server (recommended)

1. Open this folder in VS Code.
2. Install the **Live Server** extension (by Ritwick Dey) if you don't have it.
3. Right-click **`index.html`** → **Open with Live Server**.
4. The browser opens `http://127.0.0.1:5500/index.html` — that's Screen 01.

### Any other local server

```bash
# Node
npx serve .
# Python 3
python -m http.server 8080
```

Then open `http://localhost:<port>/index.html`.

> **Do not** double-click the HTML files. With `file://` URLs the browser blocks
> the `/LOGO` folder read and cross-tab sync becomes unreliable.

---

## 2. First run — the 31 logos load themselves

`js/logo-manifest.js` lists every image in the **`/LOGO`** folder. The first
time you open `index.html` the panel automatically:

* fetches each logo,
* stores it in IndexedDB,
* registers the **file name as the team name** (`Pathao.png` → team "Pathao").

You'll see a toast: *"31 team(s) loaded from /LOGO"*.

### ⚠️ You currently have 31 logos, not 32

16 matches need exactly **32 teams**. The lottery stays locked until the counter
reads `32 / 32`. You have two options:

* **Add the 32nd team by hand** — Tab *01 TEAM MANAGEMENT* → type the name →
  *CHOOSE FILE* → pick the logo → **+ ADD TEAM**.
* **Or drop the 32nd PNG into `/LOGO`**, then add one line to
  `js/logo-manifest.js`:

  ```js
  { file: "LOGO/Walton.png", name: "Walton" },
  ```

  and press **RE-IMPORT LOGO FOLDER**.

A team with no logo still works — the card shows its initials instead.

---

## 3. Operating the draw

### Setup (once)

1. **Tab 01 — TEAM MANAGEMENT**: confirm `REGISTERED TEAMS 32 / 32`.
   Edit a name, replace a logo or delete a team from the list here.
2. **Tab 03 — BRANDING & EXPORT**: upload your **Tournament Logo** (the
   FUTSAL CARNIVAL shield). Optionally upload custom backgrounds for Screen 02
   and Screen 03. Set the tournament name, subtitle and the board title
   ("First Round"). Press **SAVE IDENTITY**.
3. Press **OPEN LIVE RESULT** and **OPEN DRAW BOARD** — each opens in a new tab.
   Drag them to your second and third monitor and press **F** for fullscreen.

### The presentation flow (one window)

By default the operator can run the whole event from a single window:

```
  index.html          pick the 2 teams of a match
       |
       |  both teams placed  ->  this tab moves on automatically
       v
  live-result.html    the match, big, as one enlarged card
       |                 |
       |                 +-- DOWNLOAD & NEXT MATCH  saves the PNG and
       |                     blanks the card for the next draw
       |  click  FULL DRAW BOARD  ->
       v
  draw-board.html     all 16 matches so far
       |                 |
       |                 +-- once 16/16 are set:  FULL BRACKET ->
       |                                            bracket.html
       |  click  + NEW MATCH DRAW  ->
       v
  index.html          ready for the next match
```

### DOWNLOAD & NEXT MATCH (Screen 02)

As soon as both teams of a match are on screen, a pink button appears at
the bottom. One click saves that match as a 1920x1080 PNG **and** clears the
card to an empty one carrying the next match number, so the screen is ready
for the following draw without dropping back to the standby headline. The
moment the operator picks the next first team, it fills in as usual.

### The full bracket (Screen 04)

Once all 16 first-round matches are drawn, a **FULL BRACKET** button appears
on the draw board (shortcut `V`). It opens `bracket.html`: the 32 drawn logos
down the left under *First Round*, then Second Round, Quarter Final, Semi
Final and the Final. Those later rounds stay as `M:01 WINNER` style
placeholders -- a draw board does not know who wins. It exports to
1920x1080 PNG with `E` like the other screens.

The **AUTO-ADVANCE TO LIVE RESULT** checkbox on the lottery tab turns the
automatic jump off if you would rather stay on the control panel.

Only the tab you clicked in ever navigates. Screens you opened in their own
tabs (second and third monitor) are never moved -- they just keep live-updating.
So both ways of working are available at the same time.

On Screens 02 and 03 the flow button sits bottom-right. It fades out after a
few seconds so the audience sees a clean screen, and comes back as soon as you
move the mouse. Keyboard: **B** jumps to the board, **N** starts a new match
draw, **C** shows/hides the buttons.

### Running the lottery

1. **Tab 02 — MANUAL LOTTERY DRAW**.
2. The banner shows `NEXT SELECTION → MATCH-01 → LEFT TEAM`.
3. Click a team logo. It is placed **immediately**:
   * Screen 02 switches to **Match-01** and shows that team with
     **WAITING FOR OPPONENT** on the right.
   * Screen 03 drops the logo into the Match-01 card's left slot.
4. Click the next team → it fills **MATCH-01 RIGHT**, and Screen 02 reveals it.
5. Click again → Screen 02 jumps straight to **Match-02** with the new first team.
6. Repeat until all 32 teams are placed across 16 matches.

**Nothing is random.** The order is 100 % your clicks:
click 1 → M01 left, click 2 → M01 right, click 3 → M02 left, … click 32 → M16 right.

### Controls

| Button | What it does |
|--------|--------------|
| **UNDO LAST SELECTION** | Removes the most recent pick, frees that team, rewinds both screens. `Ctrl+Z` also works. |
| **RESET DRAW** | Asks for confirmation, clears all 16 matches, keeps teams and logos. |
| **SAVE DRAW** | Stamps the saved state. (Progress is auto-saved on every click anyway.) |
| **OPEN LIVE RESULT / DRAW BOARD** | Opens Screens 02 / 03 in new tabs. |

### Presentation-screen keys (Screens 02 and 03)

| Key | Action |
|-----|--------|
| `F` or double-click | Fullscreen on / off |
| `E` | Export this screen as a 1920×1080 PNG |
| `C` | Pin the operator strip and flow button on / off |
| `B` | (Screen 02) go to the full draw board |
| `N` | (Screen 03) start a new match draw |

The operator strip and the flow button live at the **bottom edge**: move the
mouse down there and they appear, move it away and they vanish immediately, so
the audience never sees controls on screen. `C` pins them. Neither ever appears
in an exported PNG.

---

## 4. Full HD PNG export

Tab **03 — BRANDING & EXPORT** on Screen 01:

* **EXPORT LIVE RESULT PNG** → the current match card, exactly 1920 × 1080.
* **EXPORT DRAW BOARD PNG** → the whole 16-match board, exactly 1920 × 1080.
* **BACKUP DRAW (JSON)** → a text backup of the tournament state.

Both images are **re-drawn on a dedicated 1920 × 1080 canvas**, not screenshotted.
That means the resolution is exact on any monitor, text and logos are sharp, and
no button, scrollbar or browser UI can ever leak into the file. Logos are drawn
with `object-fit: contain` logic, so nothing is stretched or cropped.

---

## 5. How to check it works

Open all three screens side by side, then walk this list.

**Teams**
- [ ] Screen 01 shows `REGISTERED TEAMS 31 / 32` (or `32 / 32` after you add one).
- [ ] Every card in the selection grid shows the right logo and name.
- [ ] Edit a team name → it changes on Screens 02 and 03 too.
- [ ] Try adding a 33rd team → blocked.

**Sequential lottery**
- [ ] Pick team 1 → banner moves to `MATCH-01 → RIGHT TEAM`, card shows `M01 L`.
- [ ] Pick team 2 → banner moves to `MATCH-02 → LEFT TEAM`.
- [ ] A picked team is greyed out and cannot be clicked again.
- [ ] Draw Overview on the right lists the pairs in order.

**Screen 02 (live)**
- [ ] After the **first** pick of a match the team shows up **instantly**, with
      WAITING FOR OPPONENT beside it — it does not wait for the second team.
- [ ] Second pick → the opponent animates in.
- [ ] First pick of the next match → the card flips straight to that match.
- [ ] **UNDO** → the screen rolls back to the previous valid match.
- [ ] **RESET** → "LOTTERY DRAW WILL START SOON".

**Screen 03 (board)**
- [ ] All 16 cards are visible from the start, empty.
- [ ] Each pick lands in the correct card and correct side, with a pop animation.
- [ ] The match being drawn has a glowing pink outline.
- [ ] Earlier matches never disappear.

**Sync & persistence**
- [ ] Clicks on Screen 01 update Screens 02 and 03 with no refresh.
- [ ] Press **F5** on any screen → it comes back with the same state.
- [ ] Close a screen and reopen it → still in sync.

**Branding**
- [ ] Upload the tournament logo → it replaces the pink name badge top-right on
      both presentation screens.
- [ ] Upload a background → it replaces the built-in stadium artwork.
- [ ] Remove it → the built-in artwork comes back.

**Export**
- [ ] Export both PNGs, open them, check **Properties → Details**: 1920 × 1080.
- [ ] No admin buttons, no operator strip, no browser chrome in the images.

---

## 6. The tournament artwork

`assets/backgrounds/board-bg.png` is the real tournament artwork, with the 16
match cards and the title text painted out and the FUTSAL CARNIVAL shield left
in place. Both presentation screens and both PNG exports use it, so the output
matches the printed design exactly.

* The round title and the date are drawn by the app, so they stay editable --
  Tab 03 -> **DRAW BOARD TITLE** and **MATCH DATE**.
* The shield comes from the artwork. Upload a **Tournament Logo** only if you
  want to replace it; the upload is drawn over the same spot.
* Delete or rename `board-bg.png` and the screens fall back to a stadium drawn
  in code (`js/scene.js`), so nothing ever renders blank.
* A transparent cut-out of the shield is also saved at
  `assets/tournament/logo.png` if you need it elsewhere.

## 6b. Design language

**Screen 01** is a light operator dashboard on the bKash brand colour
`#e2136e` with white surfaces — easy to read under venue lighting.

**Screens 02 and 03** use the tournament artwork itself: the dark maroon arena
with its spotlights and the green futsal pitch, white match cards with a pink
`Match-NN` strip and a pink `VS`. Screen 02 is the same card, enlarged to fill
the screen. Team logos are sized with `object-fit: contain` inside a fixed slot
and centred on both axes, so nothing is ever stretched or clipped.

Both presentation screens are authored at exactly **1920 × 1080** and then
uniformly scaled, so 1920×1080, 1600×900 and 1366×768 all keep the 16:9
composition with no distortion.

---

## 7. Project structure

```
bkash Footsal/
├── index.html              Screen 01 — control panel  (START HERE)
├── live-result.html        Screen 02 — live match card
├── draw-board.html         Screen 03 — 16-match board
├── bracket.html            Screen 04 — full tournament bracket
│
├── css/
│   ├── common.css          design tokens, toast, 16:9 stage scaler
│   ├── admin.css           Screen 01 (light / bKash)
│   ├── live-result.css     Screen 02
│   ├── draw-board.css      Screen 03
│   └── bracket.css         Screen 04
│
├── js/
│   ├── logo-manifest.js    list of files in /LOGO  (regenerate if you add logos)
│   ├── database.js         IndexedDB blob store for all images
│   ├── storage.js          central state + LocalStorage + BroadcastChannel sync
│   ├── ui.js               toast, confirm, file validation, fullscreen, scaler
│   ├── scene.js            procedural arena + futsal pitch artwork
│   ├── export.js           1920×1080 canvas renderer for both PNG exports
│   ├── teams.js            Screen 01 — team registration / edit / delete
│   ├── lottery.js          Screen 01 — sequential manual selection
│   ├── branding.js         Screen 01 — logo & background uploads
│   ├── admin.js            Screen 01 — bootstrap, tabs, exports
│   ├── live-result.js      Screen 02 logic
│   ├── draw-board.js       Screen 03 logic
│   └── bracket.js          Screen 04 logic
│
├── LOGO/                   your 31 team logos (PNG)
├── assets/                 optional: teams / backgrounds / tournament art
└── README.md
```

---

## 8. How the sync works

* **IndexedDB** (`js/database.js`) holds every image blob — team logos,
  tournament logo, custom backgrounds.
* **LocalStorage** holds the lightweight state: team names, IDs, the click
  order and branding text. Written on every change, so a refresh never loses
  progress.
* **BroadcastChannel** pushes each change to the other tabs instantly.
* A **storage event** fallback covers browsers without BroadcastChannel.

The whole draw is stored as **one ordered array of team IDs**. Slot *p* in that
array means match `floor(p / 2)`, side `p % 2 === 0 ? LEFT : RIGHT`. Deriving
the 16 matches from that single array is why Undo is always exactly right and
why the sequential rule can never be broken.

---

## 9. Publishing to GitHub Pages

The whole thing is static files, so GitHub Pages hosts it as-is. **Hosting it
also fixes the PNG export permanently** -- Pages serves over HTTPS, so the
canvas is never tainted the way it is with `file://`.

### What you need

* A GitHub account (free).
* The repository must be **Public** -- Pages on private repos needs a paid plan.

### Step by step (command line)

```bash
cd "C:UsersUSERDesktopkash Footsal"

git init
git add .
git commit -m "Futsal tournament manual lottery and live draw system"
git branch -M main

# create an EMPTY public repo on github.com first (no README, no .gitignore),
# then paste its URL below
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

### Turn Pages on

1. Open the repo on github.com.
2. **Settings** -> **Pages** (left sidebar).
3. **Source**: *Deploy from a branch*.
4. **Branch**: `main`, folder `/ (root)` -> **Save**.
5. Wait about a minute, then reload. Your link appears at the top:

```
https://<your-username>.github.io/<your-repo>/
```

That URL opens Screen 01. The other two are
`.../live-result.html` and `.../draw-board.html`.

### Prefer no command line?

On the repo page use **Add file -> Upload files**, drag in `index.html`,
`live-result.html`, `draw-board.html`, `README.md` and the `css`, `js`,
`LOGO` and `assets` folders, then commit and do the Pages steps above.
Do **not** upload `LOGO.rar`, `LOGO_previous/` or the WhatsApp artwork --
`.gitignore` already excludes them from the command-line route.

### Updating later

```bash
git add .
git commit -m "what changed"
git push
```

Pages redeploys in under a minute. Hard-refresh with **Ctrl+F5** if you still
see the old version -- Pages caches aggressively.

### IMPORTANT: the live link does not sync between devices

The three screens share one draw through **BroadcastChannel, LocalStorage and
IndexedDB -- all of which live inside a single browser on a single machine.**
There is no server behind this.

| Works | Does not work |
|-------|---------------|
| Three tabs / three monitors on **your** laptop stay in sync | A viewer on another computer seeing *your* draw |
| Open the link on any machine and run a complete draw there | Two operators drawing into the same board |
| Hand someone the link so they can run their own draw | Live-streaming the draw by sharing the URL |

Each visitor gets their own empty board. To show the draw to a remote
audience, **share your screen** (Zoom / Meet / OBS) or export the PNG and send
that. Real multi-device sync would need a backend (Firebase, Supabase or a
small WebSocket server), which this project deliberately does not have.

---

## 10. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Logos don't auto-load | You opened the file with `file://`. Use Live Server. |
| Screens don't sync | All three must be on the same origin (same host **and** port). |
| "Pop-up blocked" | Allow pop-ups for `localhost`, or open the HTML files in tabs yourself. |
| Lottery stays locked | You need exactly 32 registered teams. |
| PNG download does nothing / "blocked because the page was opened as a file" | You opened the HTML directly (`file://`). Chrome then treats `board-bg.png` as cross-origin and refuses to export the canvas. Run the folder through Live Server. The export still works offline, but falls back to the drawn arena instead of the artwork. |
| Fonts look plain | Poppins/Teko load from Google Fonts. Offline, the system fallback is used — layout is unaffected. |
| Want a clean slate | Tab 01 → **DELETE ALL TEAMS**, or clear site data for this origin in DevTools. |
