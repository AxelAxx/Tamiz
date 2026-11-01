# Icons (lucide-react)

Names are lucide component names (`import { House } from "lucide-react"`); the kebab id used in the
HTML sprite is in brackets. Default size 16 px (`size-4`); inside badges 14 px (`size-3.5`);
stroke 2. Icons are always paired with a word and marked `aria-hidden`.

## Navigation

| Item | Icon |
|---|---|
| Live traffic | `Activity` (activity) |
| Simulator | `FlaskConical` (flask-conical) |
| Audit log | `ScrollText` (scroll-text) |
| Cost | `Coins` (coins) |
| Providers | `Server` (server) |
| Evals | `ClipboardCheck` (clipboard-check) |
| Policy | `FileCode` (file-code) |
| Open navigation (phone) | `Menu` (menu) |
| Collapse / expand sidebar (tablet) | `PanelLeft` (panel-left) |
| Theme: switch to dark / light | `Moon` (moon) / `Sun` (sun) |
| Operator menu | `UserRound` (user-round) |
| Sign out | `LogOut` (log-out) |
| Close (sheet, drawer, dialog, chip) | `X` (x) |

## Statuses (brief section 4)

| Component | Value | Icon |
|---|---|---|
| Residency badge | local | `House` (house) |
| | eu | `ShieldCheck` (shield-check) |
| | us | `Globe` (globe) |
| | global | `Globe` (globe) |
| Outcome badge | answered | `CircleCheck` (circle-check) |
| | failed | `CircleX` (circle-x) |
| | blocked | `Ban` (ban) |
| | cancelled | `CircleMinus` (circle-minus) |
| Privacy action badge | allow | `ArrowUpRight` (arrow-up-right) |
| | anonymize | `VenetianMask` (venetian-mask) |
| | restrict_to_local ("local only") | `LockKeyhole` (lock-keyhole) |
| | block | `Ban` (ban) |
| Sensitivity indicator | none / low / high / critical | bar scale, no icon |
| | unknown | `CircleHelp` (circle-help) |
| Entity chip | critical kind | 6 px square marker, no icon |
| Fallback marker | one or more | `CornerDownRight` (corner-down-right) |
| Circuit state badge | closed | `CircleCheck` (circle-check) |
| | open | `CircleOff` (circle-off) |
| | half_open | `CircleDashed` (circle-dashed) |
| Pass/fail mark | pass | `CircleCheck` (circle-check) |
| | fail | `CircleX` (circle-x) |
| | error | `TriangleAlert` (triangle-alert) |
| | skipped | `SkipForward` (skip-forward) |
| Gateway status | connected | `CircleCheck` (circle-check) |
| | disconnected, retrying | `RefreshCw` (refresh-cw) |
| | credentials rejected | `KeyRound` (key-round) |
| Stream status | live | pulsing dot, no icon |
| | paused | `CirclePause` (circle-pause) |
| | retrying | `RefreshCw` (refresh-cw) |
| | connecting | `LoaderCircle` (loader-circle), spinning |
| | disconnected | `WifiOff` (wifi-off) |
| Simulator detector status | ok | text only |
| | unavailable / timeout / contract | text only; the deciding step uses `Ban` (ban) |

## Simulator decision flow

| Step | Icon |
|---|---|
| 1 Inspection | `ScanSearch` (scan-search) |
| 2 Classification | `Tags` (tags) |
| 3 Rule | `Signpost` (signpost) |
| 4 Privacy action | `Shield` (shield) |
| 5 Route | `Route` (route) |
| Blocked step | `Ban` (ban) |
| Simulate | `Play` (play) |
| Edit | `Pencil` (pencil) |
| Add system message / message | `Plus` (plus) |
| "This text stays in your browser tab" | `LockKeyhole` (lock-keyhole) |
| "No model was called" | `Info` (info) |
| Provider receives (anonymized) | `VenetianMask` (venetian-mask) |
| Notice disclosure | `ChevronRight` (chevron-right), rotates 90° when open |

## Region states and messages

| Use | Icon |
|---|---|
| Empty (live) | `Inbox` (inbox) |
| Empty (no match, detail not found) | `SearchX` (search-x) |
| Empty range (cost) | `CalendarX` (calendar-x) |
| No eval reports | `FileSearch` (file-search) |
| Error | `TriangleAlert` (triangle-alert) |
| Retry | `RefreshCw` (refresh-cw) |
| Stale "Last updated" | `Clock` (clock) |
| Live updates interrupted | `WifiOff` (wifi-off) |
| Session ended / expired | `Clock` (clock) |
| "Tamiz never stores what was said" | `EyeOff` (eye-off) |
| Show / hide passphrase | `Eye` (eye) / `EyeOff` (eye-off) |
| Inline field error | `CircleX` (circle-x) |
| Toast success / error | `CircleCheck` (circle-check) / `CircleX` (circle-x) |
| Copy request hash, copy draft | `Copy` (copy) |
| Pause / Resume stream | `Pause` (pause) / `Play` (play) |
| Link arrows ("Audit log", "See requests with this rule") | `ArrowRight` (arrow-right) |

## Screen controls

| Use | Icon |
|---|---|
| Date range trigger, custom range | `Calendar` (calendar) |
| Filters (phone) | `ListFilter` (list-filter) |
| Load older | `ChevronsDown` (chevrons-down) |
| KPI: actual cost / baseline / saving | `Coins` / `Scale` / `TrendingDown` |
| KPI: requests served / tokens / not served | `CircleCheck` / `ArrowDownUp` / `Ban` |
| With critical entities (live summary) | `LockKeyhole` (lock-keyhole) |
| Unreadable eval file | `FileWarning` (file-warning) |
| Failing cases disclosure | `ChevronRight` (chevron-right) |
| Policy: unsaved changes | `CircleDot` (circle-dot) |
| Policy: save / saving | `Save` (save) / `LoaderCircle` spinning |
| Policy: persistent / not persistent | `Database` (database) / `TriangleAlert` (triangle-alert) |
| Policy: issue in browser / refused by gateway | `Monitor` (monitor) / `Server` (server) |
| Policy: lint gutter marker | `CircleX` (circle-x) |
| Try in simulator | `FlaskConical` (flask-conical) |
