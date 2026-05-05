import type { ComponentType } from "react"
import HowToStartBody from "./how-to-start-an-internet-radio-station-2026"

export interface FAQ {
  question: string
  answer: string
}

export interface Article {
  slug: string
  title: string
  description: string
  date: string
  readingTime: string
  image?: string
  Body: ComponentType
  faqs?: FAQ[]
}

export const ARTICLES: Article[] = [
  {
    slug: "how-to-start-an-internet-radio-station-2026",
    title: "How to Start an Internet Radio Station in 2026",
    description:
      "Everything you actually need to know: software compared, equipment that matters, music licensing explained honestly, and how to get your first listeners.",
    date: "2026-05-01",
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
