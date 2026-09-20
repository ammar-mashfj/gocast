# AutoDJ playlists + scheduling — known gaps

The follow-ups left open by the playlists/scheduling work, checked against the
code on **2026-09-21** rather than carried over from the plan. Each one says
whether it is real, what it actually costs, and why it is still here — so the
next session can decide instead of re-deriving.

The feature itself is in `AUTODJ-SCHEDULING-PLAN.md` (design) and
`AUTODJ-SCHEDULING-HANDOFF.md` (state of the tree at the end of the build).

Status summary:

| # | Gap | Real? | State |
|---|-----|-------|-------|
| 1 | `up_next` is computed from the wrong playlist, and walked the wrong way | yes | **fixed 2026-09-21** — resolved through the programme, deck-aware; the power-card line is back |
| 2 | Show times sharing a weekday could not be saved | yes | **fixed 2026-09-21** |
| 3 | Plan §7 features | yes, deliberate | open by design |
| 4 | Plan §1 describes pre-work code | yes | harmless |

---

## 1. `up_next` names a track from the wrong playlist — FIXED

**Fixed 2026-09-21.** `StationStatusController` now eager-loads the slots
and the default, calls `AutoDjProgramme::resolve()` once per poll, and
answers both `playlist_length` and `up_next` from the playlist that resolves.
A sequential playlist keeps the anchor-and-walk; a shuffled one returns the
head of `playlists.deck` (skipping removed IDs, exactly as the scheduler
does) and an empty list before the first deal. The "Up next" line on the
power card is back. The cost noted below — three small queries on a polled
endpoint — was accepted. The original analysis is kept for the record.

**Was real.** `StationStatusController::upNext()` reads
`$station->defaultPlaylist`, and so does `playlistLength()` beside it. While a
schedule slot is active the station is playing a *different* playlist, so both
numbers describe something that is not on air.

There is a second, older error in the same method that the handoff does not
mention. `upNext()` anchors on the currently playing title and walks forward
through the list, wrapping — which is only correct for `ORDER_SEQUENTIAL`. For
a shuffled playlist the real upcoming tracks are the head of that playlist's
`deck` column, and the list this returns is unrelated to them. That predates
scheduling (shuffle shipped against `musicTracks()` in position order), so it
is not a regression — but it means the field had two ways to be wrong and only
one was written down.

**What was done first (2026-09-21, since superseded):** the one consumer,
the "Up next: …" line on the power card, was removed
(`client/components/dashboard/StationPower.tsx`). No UI reads `up_next` or
`playlist_length` for this purpose any more, so nothing displays a wrong
answer. The API still computes both on every poll.

**Cost of fixing it properly**, if the line is ever wanted back:

- *Right playlist* — small. Call `AutoDjProgramme::resolve()` instead of
  reaching for `defaultPlaylist`, and eager-load `autodjSlots.playlist` +
  `defaultPlaylist` in `__invoke()`. The catch is where it lives: this
  endpoint is polled every 3–10s per open dashboard
  (`client/hooks/useStationStatus.ts`) and currently loads nothing, while
  `resolve()` costs the slots, their playlists, and an `exists()` for the
  empty-playlist fall-through. Adding that to the hot path for a cosmetic
  string is the trade that has kept it open, and it is a fair one.
- *Right order* — larger, and the real work. Sequential can keep the
  anchor-and-walk approach but must walk pivot positions of the active
  playlist. Shuffle has to read `playlists.deck` and take the head of it,
  which also means deciding what to show when the deck is null (no cycle
  started) — probably nothing, rather than a guess.

Worth doing together or not at all: fixing only the playlist leaves the card
lying to every owner who uses shuffle.

## 2. Two show times sharing a weekday were rejected — FIXED

**Was real, and worse than the handoff recorded.**
`ReplaceStationSchedulesRequest` carried
`'schedules.*.days.*' => ['integer', 'between:0,6', 'distinct']`.

Laravel's `distinct` on a wildcard path does not mean "no duplicates in this
row". `ValidatesAttributes::extractDistinctValues()` takes the leading
explicit segment of the path — here `schedules` — and matches every key under
it against `schedules.[^.]+.days.[^.]+`, so the values are compared **across
every row**. Verified against the real validator:

```
rows: Breakfast days [1,3] · Drivetime days [1,5]
→ 422  "The schedules.0.days.0 field has a duplicate value."
       "The schedules.1.days.0 field has a duplicate value."
```

So any two shows sharing any weekday were unsaveable — "Breakfast, Mon–Fri"
plus "Drivetime, Mon–Fri" is the ordinary shape of a radio schedule, not an
edge case — and the error named a raw attribute path.

**Why it survived:** the test suite could not catch it. Every multi-row case
in `StationScheduleTest.php` happened to use disjoint days (`[0]` vs
`[1,2,3,4,5]`; `[1]` vs `[2]`), and the one case that asserted `distinct` used
a duplicate *within* a single row (`[1, 1]`), which is the behaviour that
genuinely worked. Nothing failed. It was found by reading
`ReplaceAutodjSlotsRequest`, which hit the same trap during the scheduling
build, documented it, and left the older request alone as out of scope.

**The fix:** drop `distinct` from the rule and dedupe on write instead —
`->unique()` in `StationScheduleController`, exactly what `AutodjSlotController`
does. A repeated day in one row is now canonicalised rather than refused,
which is the kinder answer to what can only be a malformed client: the editor
toggles day buttons, so it cannot produce one.

Tests: the dataset row that asserted the 422 is gone, the existing
canonicalisation test now sends `[5, 1, 3, 1]`, and
`it('saves two show times that share weekdays')` guards the regression.

## 3. Plan §7 — deliberately out of scope

Not defects; scope cuts with reasons, listed in §7 of the plan. Hard-start
slots (needs `flush_and_skip` over telnet), per-slot jingles (needs `var.set`
pushed at each boundary), weighted rotation, public "what's on now" (a design
problem — it will be confused with show times on the same page), one-off dated
shows (needs a date column and a different editor), slot-level silence
(refused on principle: the power button owns on/off).

Of these, **weighted rotation is now unblocked** — it needed playlists to
exist, and they do. It is a change to `next()`, nothing else.

## 4. `AUTODJ-SCHEDULING-PLAN.md` §1 describes pre-work code

Real, harmless. §1 surveys the code as it stood at `3c0e37d`, before any of
this landed; the status block at the top of the document says so. It reads as
a record of the starting point. Rewrite only if someone is misled by it.
