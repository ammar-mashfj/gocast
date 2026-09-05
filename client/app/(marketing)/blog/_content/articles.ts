import type { ComponentType } from "react"
import HowToStartBody from "./how-to-start-an-internet-radio-station-2026"
import OnAir247Body from "./keep-your-radio-station-on-air-24-7"
import CostsBody from "./how-much-does-it-cost-to-run-an-internet-radio-station"
import HowItWorksBody from "./how-does-an-internet-radio-station-work"

export interface FAQ {
  question: string
  answer: string
}

export interface Article {
  slug: string
  title: string
  description: string
  date: string
  /** Set when the body is revised; drives dateModified, not the visible byline. */
  updated?: string
  readingTime: string
  image?: string
  Body: ComponentType
  faqs?: FAQ[]
}

export const ARTICLES: Article[] = [
  {
    slug: "how-does-an-internet-radio-station-work",
    title: "How an Internet Radio Station Actually Works",
    description:
      "From a laptop that's never allowed to sleep to a proper streaming stack: the four jobs every station has to do, where the home-built version breaks, and how GoCast handles each one.",
    date: "2026-09-01",
    readingTime: "~8 minutes",
    Body: HowItWorksBody,
    faqs: [
      {
        question: "Does my computer have to stay on for my station to play?",
        answer:
          "Only if you self-host the whole stack at home. On GoCast the audio source runs on our servers: on Pro your uploaded music plays around the clock whether your computer is on or not, and on the free plan your computer only matters while you're actually live.",
      },
      {
        question: "What are Icecast, Shoutcast and Liquidsoap?",
        answer:
          "The traditional building blocks of the server side of internet radio. Icecast and Shoutcast are streaming servers — they take one encoded stream and serve a copy to each listener. Liquidsoap is a playout engine — it plays the music library and switches between music and live input. Hosted platforms run this class of software for you.",
      },
      {
        question: "How do listeners actually receive an internet radio stream?",
        answer:
          "Each listener's player opens a connection to the station's URL and receives its own continuous copy of the audio. That's why radio bandwidth scales with audience: a hundred listeners is a hundred simultaneous copies, roughly 13 Mbps at 128 kbps.",
      },
      {
        question: "Why does every radio platform have a listener limit?",
        answer:
          "Because every listener is a full copy of the stream coming off the platform's bandwidth, every hour of the day. Listener caps are the cost structure made visible — on GoCast that's 100 listeners at once on Free and 1,000 on Pro.",
      },
      {
        question: "Can I self-host an internet radio station instead of using a platform?",
        answer:
          "Yes — a VPS running AzuraCast is the standard route, at $5 to $15 a month plus your time. It stops being cheap once you count the evenings spent maintaining it, and once your audience outgrows the traffic allowance included with the server.",
      },
    ],
  },
  {
    slug: "how-much-does-it-cost-to-run-an-internet-radio-station",
    title: "What It Actually Costs to Run an Internet Radio Station",
    description:
      "Real numbers for platform fees, music licensing, bandwidth and gear — including why the platform fee is the smallest line on the bill.",
    date: "2026-09-01",
    readingTime: "~9 minutes",
    Body: CostsBody,
    faqs: [
      {
        question: "Can I run an internet radio station for free?",
        answer:
          "Yes. A free platform, talk content or royalty-free music, and the microphone in your laptop will get you a real station at no cost. GoCast's free tier needs no card, has no time limit, and handles up to 100 listeners at once.",
      },
      {
        question: "How much does music licensing cost for internet radio?",
        answer:
          "Nothing if you broadcast talk content or royalty-free and Creative Commons music. Playing commercial records means paying the rights bodies — SoundExchange, ASCAP and BMI in the US, equivalents elsewhere — and what you pay depends on your country, audience size and how much music you play. Some platforms, such as Live365 at around $59/month, bundle US licensing into the fee.",
      },
      {
        question: "How much bandwidth does an internet radio station use?",
        answer:
          "About 58 MB per listener per hour at 128 kbps. Ten listeners for two hours a day is roughly 35 GB a month; a hundred listeners around the clock is about 4 TB. Streaming at 64–96 kbps roughly halves it, which is an easy trade for talk content.",
      },
      {
        question: "Is it cheaper to self-host an internet radio station?",
        answer:
          "On paper, yes — $5 to $15 a month for a VPS running something like AzuraCast. It stops being cheaper once you count the time to set it up and maintain it, and once your audience pushes you past the traffic allowance included with the server.",
      },
      {
        question: "What does it cost to start a radio station on day one?",
        answer:
          "Nothing, and it should be nothing. Start on a free platform, broadcast for eight weeks, then decide what is worth paying for.",
      },
    ],
  },
  {
    slug: "keep-your-radio-station-on-air-24-7",
    title: "How to Keep Your Internet Radio Station On Air 24/7",
    description:
      "Your station can now keep playing when you are not there. What is new in GoCast, everything the free plan already does, and how to get Pro free while it is in beta.",
    date: "2026-09-01",
    readingTime: "~7 minutes",
    Body: OnAir247Body,
    faqs: [
      {
        question: "Does my internet radio station keep playing if I close my laptop?",
        answer:
          "On GoCast Pro, yes — your uploaded music keeps playing and the link listeners use keeps working. On the free plan broadcasting is live only, so the station goes quiet when you close the tab. Your player page stays up either way, and anyone who lands on it can ask to be emailed the next time you go live.",
      },
      {
        question: "Do I need to pay to start an internet radio station on GoCast?",
        answer:
          "No. The free plan is free forever with no card: browser broadcasting with push-to-talk, a drag-and-drop file queue, a shareable player page with live track info, and up to 100 listeners at once. Pro adds music that plays 24/7 while you are away.",
      },
      {
        question: "What happens to the AutoDJ when I go live?",
        answer:
          "The music stops and you take over straight away. When you finish, it picks back up. Listeners stay connected through both switches, so nobody has to re-open the link.",
      },
      {
        question: "How much music can I upload to AutoDJ?",
        answer:
          "3 GB per station, shared between your music and your jingles — roughly 30 to 35 hours.",
      },
      {
        question: "How much does GoCast Pro cost right now?",
        answer:
          "Nothing while it is in beta. You request it from your dashboard, and stations we invite in get the full thing without paying and without entering a card. Once billing opens Pro is $15 a month, and we give notice before anyone is charged.",
      },
      {
        question: "Can I broadcast to GoCast from BUTT or Mixxx?",
        answer:
          "Broadcasting from desktop apps is part of Pro. Your station accepts the same connection any standard radio encoder uses, and the details come with your Pro onboarding.",
      },
    ],
  },
  {
    slug: "how-to-start-an-internet-radio-station-2026",
    title: "How to Start an Internet Radio Station in 2026",
    description:
      "Everything you actually need to know: software compared, equipment that matters, music licensing explained honestly, and how to get your first listeners.",
    date: "2026-05-01",
    updated: "2026-08-31",
    readingTime: "~10 minutes",
    image: "/blog/how-to-start-an-internet-radio-station-2026.webp",
    Body: HowToStartBody,
    faqs: [
      {
        question: "Can I broadcast internet radio from my phone?",
        answer:
          "Yes. Browser-based platforms like GoCast work on mobile. Keep the browser tab in the foreground for reliable streams — mobile browsers throttle background tabs. For longer broadcasts, use a laptop or desktop.",
      },
      {
        question:
          "What's the difference between internet radio and a podcast?",
        answer:
          "A podcast is pre-recorded episodes published to a feed (Spotify, Apple Podcasts) that listeners consume on their own schedule. Internet radio is a live or scheduled audio stream that listeners tune into in real time. Some platforms let you do both.",
      },
      {
        question: "How much does it cost to run an internet radio station?",
        answer:
          "You can run one for free. GoCast's free tier is $0 with no card and handles up to 100 concurrent listeners. Self-hosting AzuraCast costs $5-15/month for the VPS. Paid platforms run $15/month (GoCast Pro) to $29/month (Radio.co) and $59+/month (Live365, which bundles US music licensing). The costs that scale are bandwidth and, if you play commercial music, licensing.",
      },
      {
        question:
          "How many listeners can a small internet radio station get?",
        answer:
          "Most small stations have 10–100 regular listeners. Top independent stations reach 1,000–10,000. Growth depends on niche specificity and broadcast consistency, not equipment or platform choice.",
      },
    ],
  },
]

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug)
}
