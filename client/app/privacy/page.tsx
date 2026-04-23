import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How GoCast collects, uses, and protects your data.",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="text-sm text-muted-foreground no-underline hover:text-foreground transition-colors"
        >
          &larr; Back to GoCast
        </Link>

        <h1 className="text-3xl font-semibold mt-8 mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-12">
          Last updated: April 15, 2026
        </p>

        <div className="flex flex-col gap-10 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">Overview</h2>
            <p>
              GoCast is a live radio streaming platform. This policy explains what data we collect,
              why we collect it, and how we protect it. We believe in collecting the minimum data
              necessary to provide the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">Data We Collect</h2>

            <h3 className="text-sm font-medium text-foreground mt-4 mb-2">Account Information</h3>
            <p>
              When you create an account, we collect your name and email address. If you sign in with
              Google, we also receive your Google profile ID and profile photo URL. We do not store
              your Google password or access token beyond the initial authentication.
            </p>

            <h3 className="text-sm font-medium text-foreground mt-4 mb-2">Station Data</h3>
            <p>
              When you create a station, we store the station name, slug, description, genre, and any
              artwork you upload. This information is publicly visible on your station&apos;s player page.
            </p>

            <h3 className="text-sm font-medium text-foreground mt-4 mb-2">Broadcast Data</h3>
            <p>
              When you broadcast, we record session start and end times, peak listener counts, and
              track metadata (song titles and artist names) that you provide. Audio streams pass through
              our relay server to Icecast but are not recorded or stored.
            </p>

            <h3 className="text-sm font-medium text-foreground mt-4 mb-2">Listener Data</h3>
            <p>
              Listeners do not need an account. We track aggregate listener counts per station in real
              time but do not collect personal data from listeners. We do not use tracking pixels,
              fingerprinting, or third-party analytics on the player page.
            </p>

            <h3 className="text-sm font-medium text-foreground mt-4 mb-2">Uploaded Files</h3>
            <p>
              Audio files you upload for playback are processed in your browser and streamed directly
              to our relay server. They are not stored on our servers. Station artwork images are stored
              on our servers and served publicly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">How We Use Your Data</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1.5">
              <li>To provide and maintain the streaming service</li>
              <li>To authenticate your account and authorize access to your stations</li>
              <li>To display station information on public player pages</li>
              <li>To show real-time listener counts and now-playing metadata</li>
              <li>To send email verification and service-related notifications</li>
              <li>To detect and prevent abuse (rate limiting, stale session cleanup)</li>
            </ul>
            <p className="mt-3">
              We do not sell your data. We do not use your data for advertising. We do not share your
              data with third parties except as described below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">Third-Party Services</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1.5">
              <li>
                <strong className="text-foreground">Google OAuth</strong> — used for &ldquo;Sign in with Google.&rdquo;
                We receive your name, email, and profile photo. Google&apos;s privacy policy applies to data
                they collect during the sign-in flow.
              </li>
              <li>
                <strong className="text-foreground">Sentry</strong> — used for error monitoring.
                May receive error stack traces and request metadata. No personal data is intentionally sent.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">Cookies</h2>
            <p>
              We use two cookies to maintain your session:
            </p>
            <ul className="list-disc pl-5 flex flex-col gap-1.5 mt-2">
              <li>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">token</code> — your authentication
                token, used to authorize API requests.
              </li>
              <li>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">user</code> — your user profile
                (name, email), used to personalize the interface without an extra API call.
              </li>
            </ul>
            <p className="mt-2">
              Both cookies are set with <code className="text-xs bg-muted px-1.5 py-0.5 rounded">SameSite=Lax</code> and
              the <code className="text-xs bg-muted px-1.5 py-0.5 rounded">Secure</code> flag in production.
              We do not use tracking cookies, analytics cookies, or third-party cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">Data Retention</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1.5">
              <li>Account data is retained until you delete your account.</li>
              <li>Broadcast session history is retained indefinitely for your station statistics.</li>
              <li>Real-time data (listener counts, now-playing metadata) is stored in Redis and cleared when your broadcast ends.</li>
              <li>Authentication tokens expire after 30 days of inactivity.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">Your Rights</h2>
            <p>You can:</p>
            <ul className="list-disc pl-5 flex flex-col gap-1.5 mt-2">
              <li>View and update your account information from the dashboard.</li>
              <li>Delete individual stations and their associated broadcast history.</li>
              <li>Request a full export or deletion of your data by contacting us.</li>
              <li>Revoke Google account linking at any time from your Google account settings.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">Security</h2>
            <p>
              We protect your data with HTTPS encryption in transit, hashed passwords (bcrypt),
              rate-limited API endpoints, and scoped authentication tokens. Internal relay communication
              is authenticated with a shared secret. We do not store plaintext passwords.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">Changes to This Policy</h2>
            <p>
              We may update this policy as the service evolves. Significant changes will be communicated
              via email or an in-app notice. The &ldquo;last updated&rdquo; date at the top reflects the most recent revision.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">Contact</h2>
            <p>
              For questions about this policy or to exercise your data rights, contact us
              at{" "}
              <a href="mailto:privacy@gocast.fm" className="text-primary no-underline hover:underline">
                privacy@gocast.fm
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
