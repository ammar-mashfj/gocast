import type { ComponentType } from "react"

import CreateAccountBody from "./create-your-account"
import CreateStationBody from "./create-your-station"
import PlayerPageBody from "./your-player-page"
import FreeAndProBody from "./free-and-pro"
import TurnStationOnBody from "./turning-your-station-on-and-off"
import GoLiveBrowserBody from "./go-live-from-your-browser"
import StudioBody from "./using-the-studio"
import EncoderBody from "./broadcast-from-butt-or-mixxx"
import UploadMusicBody from "./upload-your-music"
import PlaylistsBody from "./playlists-and-the-rotation"
import ScheduleBody from "./schedule-playlists-by-time"
import ShareBody from "./share-your-station"
import EmbedBody from "./embed-the-player"
import AudienceBody from "./read-your-audience-page"
import NobodyHearsBody from "./nobody-can-hear-my-station"
import EncoderStuckBody from "./my-encoder-wont-connect"
import WentOffAirBody from "./my-station-went-off-air"

/**
 * Help articles: how to do one thing, for somebody who has already signed up.
 *
 * DELIBERATELY NOT THE BLOG, and the difference is not tone. A blog post
 * answers "should I start a radio station?" for a stranger arriving from a
 * search engine, so it is dated, bylined, essay-shaped and optimised to be
 * found. One of these answers "why won't BUTT connect?" for somebody who is
 * mid-task and probably annoyed, so it is short, current, step-shaped and
 * optimised to be closed again. Merging the two would have meant every
 * troubleshooting answer carrying a publication date that makes it look stale,
 * and every essay competing with a two-paragraph version of itself.
 *
 * Where they overlap, the help article owns the TASK and links to the blog for
 * the CONCEPTS — see schedule-playlists-by-time, which is the short version of
 * a blog post that is still worth reading and is not reproduced here.
 */
export interface HelpArticle {
  slug: string
  /**
   * Task-shaped, in the reader's words rather than the product's. "Go live
   * from your browser", not "Browser broadcasting" — somebody scanning this
   * index is looking for the thing they are trying to do.
   */
  title: string
  /** One line, under the title in the index and as the meta description. */
  description: string
  category: CategoryId
  /**
   * When the body was last checked against the product.
   *
   * Not rendered as a byline the way the blog renders its dates — a help page
   * stamped with a date six months old reads as abandoned even when every word
   * is still true. It exists so that a screenshot retake or a behaviour change
   * has somewhere to record itself, and so a stale sweep can sort by it.
   */
  updated: string
  Body: ComponentType
  /**
   * Shown as a "needs Pro" note at the top. The article is still published and
   * still indexed on every plan: somebody on Free deciding whether to upgrade
   * is exactly who needs to read what the feature does.
   */
  pro?: boolean
  /** Slugs of articles offered at the foot. Unknown slugs are dropped. */
  related?: string[]
}

export type CategoryId =
  | "getting-started"
  | "going-live"
  | "autodj"
  | "listeners"
  | "troubleshooting"

export interface HelpCategory {
  id: CategoryId
  title: string
  /** Sits under the category heading on the index. One line. */
  blurb: string
}

/**
 * Order is the order of the index, and it is the order somebody meets the
 * product in — sign up, get on air, automate it, grow it. Troubleshooting is
 * last because it is the only group nobody reads in sequence; they arrive
 * there from a search or from a `?` next to whatever just failed.
 */
export const CATEGORIES: HelpCategory[] = [
  {
    id: "getting-started",
    title: "Getting started",
    blurb: "From a new account to a station with a link you can share.",
  },
  {
    id: "going-live",
    title: "Going live",
    blurb: "Broadcasting from your browser, or from the software you already use.",
  },
  {
    id: "autodj",
    title: "AutoDJ and scheduling",
    blurb: "Music that keeps playing when you are not there, at the times you choose.",
  },
  {
    id: "listeners",
    title: "Your listeners",
    blurb: "Getting people to your station, and seeing who turned up.",
  },
  {
    id: "troubleshooting",
    title: "When something is wrong",
    blurb: "The three failures that account for most of them, and what each one means.",
  },
]

export const HELP_ARTICLES: HelpArticle[] = [
  // Getting started
  {
    slug: "create-your-account",
    title: "Create your account",
    description:
      "Signing up with email or with Google, and why you have to verify your address before you can broadcast.",
    category: "getting-started",
    updated: "2026-09-21",
    Body: CreateAccountBody,
    related: ["create-your-station", "free-and-pro"],
  },
  {
    slug: "create-your-station",
    title: "Create your station",
    description:
      "Naming it, giving it artwork and a description, and what your station's address will be.",
    category: "getting-started",
    updated: "2026-09-21",
    Body: CreateStationBody,
    related: ["your-player-page", "turning-your-station-on-and-off"],
  },
  {
    slug: "your-player-page",
    title: "Your player page",
    description:
      "The page listeners land on, what it shows when you are off air, and the link you hand out.",
    category: "getting-started",
    updated: "2026-09-23",
    Body: PlayerPageBody,
    related: ["share-your-station", "embed-the-player"],
  },
  {
    slug: "free-and-pro",
    title: "What you get on Free and on Pro",
    description:
      "Every limit that differs between the two plans, and how to ask for Pro while it is in beta.",
    category: "getting-started",
    updated: "2026-09-23",
    Body: FreeAndProBody,
    related: ["upload-your-music", "broadcast-from-butt-or-mixxx"],
  },

  // Going live
  {
    slug: "turning-your-station-on-and-off",
    title: "Turning your station on and off",
    description:
      "What the power button does, what each status means, and why going live switches the station on for you.",
    category: "going-live",
    updated: "2026-09-21",
    Body: TurnStationOnBody,
    related: ["go-live-from-your-browser", "my-station-went-off-air"],
  },
  {
    slug: "go-live-from-your-browser",
    title: "Go live from your browser",
    description:
      "Broadcasting with nothing but a microphone and a tab — the permission prompt, the handover, and the one thing that will cut you off.",
    category: "going-live",
    updated: "2026-09-21",
    Body: GoLiveBrowserBody,
    related: ["using-the-studio", "nobody-can-hear-my-station"],
  },
  {
    slug: "using-the-studio",
    title: "Using the studio",
    description:
      "The mic meter, the file queue, push-to-talk, and the encoder health readout that tells you whether your audio is actually leaving.",
    category: "going-live",
    updated: "2026-09-21",
    Body: StudioBody,
    related: ["go-live-from-your-browser", "nobody-can-hear-my-station"],
  },
  {
    slug: "broadcast-from-butt-or-mixxx",
    title: "Broadcast from BUTT, Mixxx or RadioDJ",
    description:
      "Connecting desktop broadcast software to your station over the Icecast 2 source protocol.",
    category: "going-live",
    updated: "2026-09-21",
    pro: true,
    Body: EncoderBody,
    related: ["my-encoder-wont-connect", "turning-your-station-on-and-off"],
  },

  // AutoDJ
  {
    slug: "upload-your-music",
    title: "Upload your music",
    description:
      "File formats, size limits, how much fits in 3 GB, and where an upload lands.",
    category: "autodj",
    updated: "2026-09-21",
    pro: true,
    Body: UploadMusicBody,
    related: ["playlists-and-the-rotation", "free-and-pro"],
  },
  {
    slug: "playlists-and-the-rotation",
    title: "Playlists and the rotation",
    description:
      "Building playlists out of your library, shuffle, the default playlist, and what plays when nothing is scheduled.",
    category: "autodj",
    updated: "2026-09-21",
    pro: true,
    Body: PlaylistsBody,
    related: ["schedule-playlists-by-time", "upload-your-music"],
  },
  {
    slug: "schedule-playlists-by-time",
    title: "Schedule playlists by day and time",
    description:
      "Giving a playlist a slot on the week, slots that cross midnight, and how precisely a slot starts.",
    category: "autodj",
    updated: "2026-09-21",
    pro: true,
    Body: ScheduleBody,
    related: ["playlists-and-the-rotation", "turning-your-station-on-and-off"],
  },

  // Listeners
  {
    slug: "share-your-station",
    title: "Share your station",
    description:
      "The link, how it looks when somebody pastes it somewhere, and the notify list for people who arrive while you are off air.",
    category: "listeners",
    updated: "2026-09-21",
    Body: ShareBody,
    related: ["your-player-page", "embed-the-player"],
  },
  {
    slug: "embed-the-player",
    title: "Embed the player on your site",
    description:
      "Putting a working player on your own page with a snippet of HTML.",
    category: "listeners",
    updated: "2026-09-21",
    pro: true,
    Body: EmbedBody,
    related: ["share-your-station", "free-and-pro"],
  },
  {
    slug: "read-your-audience-page",
    title: "Read your audience page",
    description:
      "What the chart counts, what the breakdowns mean, and the numbers we deliberately do not show you.",
    category: "listeners",
    updated: "2026-09-21",
    pro: true,
    Body: AudienceBody,
    related: ["share-your-station", "free-and-pro"],
  },

  // Troubleshooting
  {
    slug: "nobody-can-hear-my-station",
    title: "Nobody can hear my station",
    description:
      "You are on air, you are talking, and the player is silent. The four places it breaks, in the order worth checking.",
    category: "troubleshooting",
    updated: "2026-09-21",
    Body: NobodyHearsBody,
    related: ["go-live-from-your-browser", "turning-your-station-on-and-off"],
  },
  {
    slug: "my-encoder-wont-connect",
    title: "My encoder will not connect",
    description:
      "BUTT, Mixxx or RadioDJ refusing your station — the five things that cause nearly all of it.",
    category: "troubleshooting",
    updated: "2026-09-21",
    pro: true,
    Body: EncoderStuckBody,
    related: ["broadcast-from-butt-or-mixxx", "turning-your-station-on-and-off"],
  },
  {
    slug: "my-station-went-off-air",
    title: "My station went off air on its own",
    description:
      "Stations stop themselves after ten minutes of silence. What counts as silence, and what does not.",
    category: "troubleshooting",
    updated: "2026-09-21",
    Body: WentOffAirBody,
    related: ["turning-your-station-on-and-off", "playlists-and-the-rotation"],
  },
]

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug)
}

export function articlesInCategory(id: CategoryId): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.category === id)
}

/**
 * Resolve a `related` list to real articles, dropping anything that no longer
 * exists. A renamed slug should cost a missing link at the foot of one page,
 * never a build failure or a 404 for the reader.
 */
export function relatedArticles(article: HelpArticle): HelpArticle[] {
  return (article.related ?? [])
    .map((slug) => getHelpArticle(slug))
    .filter((a): a is HelpArticle => a !== undefined && a.slug !== article.slug)
}
