---
target: all dashboard (authed) pages
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/ammar/Desktop/personal/gocast/client/app/dashboard"
timestamp: 2026-09-26T12-29-09Z
slug: client-app-dashboard
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Studio lamp excellent; overview header "Live now" vs status card "Status unknown" |
| 2 | Match System / Real World | 2 | ducks, liners, station IDs, running order, mount, Icecast 2, kbps, "not sampled yet" never defined |
| 3 | User Control and Freedom | 3 | Dead end when live from another browser: Open studio -> "already live", no stop |
| 4 | Consistency and Standards | 2 | Four power verbs; 89 vs 88 vs 19 broadcasts; 24h axis vs 12h inputs; two schedules |
| 5 | Error Prevention | 3 | Take off air (AutoDJ) has no confirm |
| 6 | Recognition Rather Than Recall | 3 | Schedule slot rows: 12 controls, unlabelled name field, icon-only library actions |
| 7 | Flexibility and Efficiency | 3 | Strong studio shortcuts; no slot duplicate / bulk add |
| 8 | Aesthetic and Minimalist | 3 | Overview has six zones and 11 actions |
| 9 | Error Recovery | 3 | Fault lamp copy names the fix; "already live" has no remedy |
| 10 | Help and Documentation | 2 | Only 4 `?` links; AutoDJ `?` explains file formats, not AutoDJ; none in studio |
| **Total** | | **27/40** | **Acceptable** |

## Priority issues
1. [P1] Numbers contradict each other (89/88/19 broadcasts; checklist "nobody tuned in"/peak 0 vs Audience 7 daily listeners; Live now vs Status unknown). Fix: one source per metric, label ranges.
2. [P1] Jargon with no glossary; help links point at the wrong articles. Fix: inline plain gloss on first use; AutoDJ ? -> what AutoDJ is; studio help link; ducking article.
3. [P1] Live-from-another-browser dead end (StationPower broadcasterAttached branch). Fix: "End that broadcast" with confirm.
4. [P2] Power vocabulary overload: Go live / Put on air / Take over live / Take off air. Fix: Start AutoDJ / Stop station + 3-state legend.
5. [P2] Explanations set smallest and dimmest (12px muted prose); schedule split across Settings and AutoDJ with 24h/12h mismatch.
Also: Free upsell says "close your encoder" (AutoDjUpsell.tsx:40, AutoDjRotation.tsx:72) and "then loop" (AutoDjUpsell.tsx:18, PlaylistView.tsx:166) predates Shuffle.

## Detector
CLI 0 findings across 84 files. Browser: layout-transition (shadcn sidebar, FP), nested-cards (header FP; status card, library toolbar, studio already-live card real), audience skipped-heading h1->h3, audience 11px footnote, HowWeCount 88ch line. Contrast: tokens pass; "Unknown artist" /60 = 3.41, reorder hint /70 = ~4.2, bullet separators 1.21 not aria-hidden.

## Personas
Jordan: Put on air vs Go live; peak 0 vs 7 listeners. Sam: document.title never changes; schedule rows unlabelled. Alex: no slot duplicate. Volunteer: can't tell if station is on; can't end a show left running; Show times vs Schedule for Sunday service; Icecast wall in Settings; no plan indicator for Pro.
