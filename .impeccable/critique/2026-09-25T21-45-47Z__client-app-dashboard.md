---
target: dashboard layout and all pages, mainly studio
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/ammar/Desktop/personal/gocast/client/app/dashboard"
timestamp: 2026-09-25T21-45-47Z
slug: client-app-dashboard
---
# Critique: dashboard layout + pages (focus: studio)
Method: dual-agent. Live studio console not rendered (needs an active broadcast); studio findings are source-backed. Mobile width not rendered.

## Scores (24/40, Acceptable)
1 Visibility 2 | 2 Real world 3 | 3 Control 2 | 4 Consistency 1 | 5 Error prevention 2 | 6 Recognition 3 | 7 Efficiency 3 | 8 Minimalism 2 | 9 Recovery 3 | 10 Help 3

## Specificity
Copy is authored for radio (dead air, ducked, s lost, on-air-at times); visuals are stock shadcn neutral + violet. CLI detector 0 findings; browser detector 15 overview / 13 library / 6 pre-live.

## Priority issues
- [P0] Mobile End (MobileStreamBar.tsx:66-85, h-7, no confirm) and Clear queue (FileQueue.tsx:262, MobileStudio.tsx:334) unguarded while on air.
- [P1] State colour contradicts: healthy "On air" strip uses destructive red (OnAirDeck.tsx:290-313), banner green, overview green=live; mic-hot sky on desktop, red on mobile. Need semantic on-air/mic-hot/warning/fault tokens.
- [P1] Fault signal least visible: EncoderHealth 12px muted (studio/page.tsx:45-75); status strip says "listeners are hearing this" during dead air; no aria-live anywhere; latched mic invisible on other dashboard pages.
- [P1] Audience page contradicts itself (Listening time 0m / Listeners 7 / Avg 15m53s / Peak 0; Countries empty beside 100% devices).
- [P2] Primary #8b5cf6 with white = 4.2:1, fails AA on every primary button (globals.css:145); 9-10px text in ~19 places.

## Other
Mobile studio lacks listener count, encoder health, dead-air, reconnecting; local uptime timer; program-bus meter. Overview power controls enabled while "Checking…". Breadcrumb lowercase schedule/audience; AutoDJ vs Music naming; two near-identical schedule editors; library toolbar ~10 controls; StationArtwork opacity-0 when onLoad fires before hydration (StationArtwork.tsx:64); extra success screen before studio; no end-of-show moment; K/N/P only fire when body focused.
