---
target: check the dashboard pages
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/ammar/Desktop/personal/gocast/client/app/dashboard"
timestamp: 2026-09-26T10-39-08Z
slug: client-app-dashboard
---
# Critique: dashboard pages (client/app/dashboard), 2026-09-26
Method: dual-agent. Score 28/40.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | Control-strip pill shows ON AIR (violet) for a live host and while status is unreachable |
| 2 | Match real world | 3 | "Icecast", "CDN in front of the API" leak into copy |
| 3 | User control | 3 | Undo toasts, confirm dialogs, sign-out-while-live guard |
| 4 | Consistency | 2 | Multiple filled buttons per view; violet Upgrade vs amber Pro; breadcrumb AutoDJ/Schedule |
| 5 | Error prevention | 3 | Distinct schedule names |
| 6 | Recognition | 3 | HelpLinks everywhere; twin schedule editors rely on prose |
| 7 | Flexibility | 3 | Shortcuts only in studio |
| 8 | Minimalist | 2 | Copy-heavy footnotes; Audience empty = wall of dashes |
| 9 | Error recovery | 3 | error.tsx is a model; go-live error thin |
| 10 | Help | 3 | Article-specific help links |

## Priority issues
1. [P1] StationPower.tsx:58 live -> "On air" violet pill; unreachable state keeps lit ON AIR pill and duplicates "Can't reach" in Now playing (:536). Conflicts with PRODUCT.md principle 4. /impeccable clarify
2. [P1] Sidebar solid violet "Upgrade" + sparkles (AppSidebar.tsx:263-266) on every route; LibraryView.tsx:715 filled upgrade + AutoDjUpsell duplicate; Pro not self-serve so "Upgrade" overclaims; account settings 2-3 filled buttons. /impeccable colorize, distill
3. [P2] Audience/Broadcasts/Schedule are generic templates; empty states drown in copy; violet breakdown bars; schedule has no week view (WeekStrip exists). /impeccable bolder, onboard
4. [P2] live/page.tsx go-live screen: centred card, border-2 error circle, emerald = done, "Going on air" vs "Going live". /impeccable polish
5. [P3] Mono on counts/range labels (broadcasts/page.tsx:98, RecentBroadcasts.tsx:83, audience/page.tsx:95, StreamPanel.tsx:234, EncoderConnection.tsx:178); backdrop-blur-sm StationFormDialog.tsx:154; day chips 32px (ScheduleEditor.tsx:202). /impeccable typeset

Detector: CLI 0 findings (~78 files). Browser: line-length ~92ch at LibraryView.tsx:846, AutodjSlotsEditor.tsx:361 (real); nested bordered box StationShare.tsx:107 (minor); sidebar transitions (stock shadcn); rest false positives.
