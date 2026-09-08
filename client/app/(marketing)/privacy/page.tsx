import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How GoCast collects, uses, and protects your data.",
}

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-semibold mb-2">Privacy Policy</h1>
      <p className="text-sm text-text-muted mb-12">
        Last updated: September 8, 2026
      </p>

      <div className="flex flex-col gap-10 text-sm leading-relaxed text-text-muted">
          <section>
            <h2 className="text-lg font-medium text-white mb-3">Overview</h2>
            <p>
              GoCast is a live radio streaming platform. This policy explains what data we collect,
              why we collect it, and how we protect it. We believe in collecting the minimum data
              necessary to provide the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">Data We Collect</h2>

            <h3 className="text-sm font-medium text-white mt-4 mb-2">Account Information</h3>
            <p>
              When you create an account, we collect your name and email address. If you sign in with
              Google, we also receive your Google profile ID and profile photo URL. We do not store
              your Google password or access token beyond the initial authentication.
            </p>

            <h3 className="text-sm font-medium text-white mt-4 mb-2">Station Data</h3>
            <p>
              When you create a station, we store the station name, slug, description, genre, and any
              artwork you upload. This information is publicly visible on your station&apos;s player page.
            </p>

            <h3 className="text-sm font-medium text-white mt-4 mb-2">Broadcast Data</h3>
            <p>
              When you broadcast, we record session start and end times, peak listener counts, and
              track metadata (song titles and artist names) that you provide. Audio streams pass through
              our relay server to Icecast but are not recorded or stored.
            </p>

            <h3 className="text-sm font-medium text-white mt-4 mb-2">Listener Data</h3>
            <p>
              Listeners do not need an account. When someone presses play we open a listening session,
              so a station can see how many people are tuned in and where its audience is. That session
              records the country the request came from, the broad device and browser type, the host of
              the referring page — never the full URL, because a path can carry personal data — and
              when listening started and stopped.
            </p>
            <p className="mt-3">
              We do not store listeners&apos; IP addresses. The address is used at the moment of the
              request to resolve a country and to compute a hash salted with a secret that rotates
              daily. That is enough to avoid counting the same person twice within a day, and not
              enough to identify them or to link them across days.
            </p>
            <p className="mt-3">
              If you ask to be told when a station goes live, we store your email address against that
              station so we can send you that one email. It is not used for anything else.
            </p>
            <p className="mt-3">
              There are no tracking pixels, advertising, or third-party analytics on player pages.
              Sentry session replay, described below, samples a small number of sessions across the
              whole site.
            </p>

            <h3 className="text-sm font-medium text-white mt-4 mb-2">Uploaded Files</h3>
            <p>
              Audio you upload to a station&apos;s library is stored on our servers, because playing it
              back on air is the point of the library. It is kept until you delete the track, the
              station, or your account, and it is never used for anything other than broadcasting on
              your own station.
            </p>
            <p className="mt-3">
              Audio you broadcast live is different: it passes through our relay to listeners and is
              not recorded or kept. Station artwork is stored on our servers and served publicly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">How We Use Your Data</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1.5">
              <li>To provide and maintain the streaming service</li>
              <li>To authenticate your account and authorize access to your stations</li>
              <li>To display station information on public player pages</li>
              <li>To show real-time listener counts and now-playing metadata</li>
              <li>To give broadcasters audience statistics for their own stations</li>
              <li>To email listeners who asked to hear when a station goes live</li>
              <li>To send email verification and service-related notifications</li>
              <li>To detect and prevent abuse (rate limiting, stale session cleanup)</li>
            </ul>
            <p className="mt-3">
              We do not sell your data. We do not use your data for advertising. We do not share your
              data with third parties except as described below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">Third-Party Services</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1.5">
              <li>
                <strong className="text-white">Google OAuth</strong> — used for &ldquo;Sign in with Google.&rdquo;
                We receive your name, email, and profile photo. Google&apos;s privacy policy applies to data
                they collect during the sign-in flow.
              </li>
              <li>
                <strong className="text-white">Sentry</strong> — error monitoring and session replay.
                Receives error stack traces and request metadata, and records a small sample of
                browsing sessions — roughly 2% of sessions, and half of those where an error occurs —
                so we can see what led to a fault. Recordings mask all text and form inputs and
                block media,
                and we do not attach account identifiers to them. Replay applies across the site,
                including public player pages.
              </li>
              <li>
                <strong className="text-white">Resend</strong> — our email provider. Receives the
                address and contents of any email we send: verification codes, password resets,
                station-live alerts, and service notices.
              </li>
              <li>
                <strong className="text-white">Cloudflare</strong> — sits in front of the site, so it
                handles every request before we do and tells us which country a listener is in. Their
                own privacy policy governs that traffic.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">Cookies</h2>
            <p>
              We use three cookies, all of them first-party:
            </p>
            <ul className="list-disc pl-5 flex flex-col gap-1.5 mt-2">
              <li>
                <code className="text-xs bg-white/[0.04] px-1.5 py-0.5 rounded">token</code> — your authentication
                token. Set by our server as <code className="text-xs bg-white/[0.04] px-1.5 py-0.5 rounded">HttpOnly</code>,
                so page scripts cannot read it, and it expires 30 days after it is issued.
              </li>
              <li>
                <code className="text-xs bg-white/[0.04] px-1.5 py-0.5 rounded">user</code> — your name and email,
                used to personalize the interface without an extra API call.
              </li>
              <li>
                <code className="text-xs bg-white/[0.04] px-1.5 py-0.5 rounded">sidebar_state</code> — whether you
                left the dashboard sidebar open or collapsed.
              </li>
            </ul>
            <p className="mt-2">
              All are set with <code className="text-xs bg-white/[0.04] px-1.5 py-0.5 rounded">SameSite=Lax</code> and
              the <code className="text-xs bg-white/[0.04] px-1.5 py-0.5 rounded">Secure</code> flag in production.
              We do not use tracking cookies, analytics cookies, or third-party cookies.
            </p>
            <p className="mt-3">
              Some things stay in your browser&apos;s local storage and are never sent to us at all:
              the stations you save, your recent listening history, and which stations you have asked
              to be notified about. That data lives on your device only. Clearing your browser storage
              removes it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">Data Retention</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1.5">
              <li>
                Account data is kept until you delete your account. Deleting it revokes your sessions
                and strips your name, email, and Google details from the record; an anonymous row
                remains so past activity stays consistent.
              </li>
              <li>
                Stations you delete — and the audio in their libraries — are kept for 30 days so a
                deletion can be undone, then permanently erased.
              </li>
              <li>
                Individual listening sessions are deleted after 90 days. The summaries built from them
                (counts by hour and by country) are kept, and cannot be traced back to a session.
              </li>
              <li>Broadcast session history is retained indefinitely for your station statistics.</li>
              <li>Real-time data (listener counts, now-playing metadata) is stored in Redis and cleared when your broadcast ends.</li>
              <li>Authentication tokens expire 30 days after they are issued.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">Your Rights</h2>
            <p>You can:</p>
            <ul className="list-disc pl-5 flex flex-col gap-1.5 mt-2">
              <li>View and update your account information from the dashboard.</li>
              <li>
                Delete individual stations. Their broadcast history goes with them, and their audio is
                erased once the 30-day recovery window is up.
              </li>
              <li>Ask us to remove a notification email address from a station at any time.</li>
              <li>Request a full export or deletion of your data by contacting us.</li>
              <li>Revoke Google account linking at any time from your Google account settings.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">Security</h2>
            <p>
              We protect your data with HTTPS encryption in transit, hashed passwords (bcrypt),
              rate-limited API endpoints, and scoped authentication tokens. Internal relay communication
              is authenticated with a shared secret. We do not store plaintext passwords.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">Changes to This Policy</h2>
            <p>
              We may update this policy as the service evolves. Significant changes will be communicated
              via email or an in-app notice. The &ldquo;last updated&rdquo; date at the top reflects the most recent revision.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-3">Contact</h2>
            <p>
              For questions about this policy or to exercise your data rights, contact us
              at{" "}
              <a href="mailto:privacy@gocast.fm" className="text-violet-full no-underline hover:underline">
                privacy@gocast.fm
              </a>.
            </p>
          </section>
        </div>
    </main>
  )
}
