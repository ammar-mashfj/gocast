import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms and conditions for using the GoCast live radio streaming platform.",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="text-sm text-muted-foreground no-underline hover:text-foreground transition-colors"
        >
          &larr; Back to GoCast
        </Link>

        <h1 className="text-3xl font-semibold mt-8 mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-12">
          Last updated: April 15, 2026
        </p>

        <div className="flex flex-col gap-10 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">1. Acceptance</h2>
            <p>
              By creating an account or using GoCast, you agree to these terms. If you do not agree,
              do not use the service. We may update these terms from time to time — continued use after
              changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">2. The Service</h2>
            <p>
              GoCast is a live radio streaming platform that lets you broadcast audio from your browser.
              We provide the relay infrastructure, player pages, and broadcaster tools. You provide
              the content.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">3. Your Account</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1.5">
              <li>You must provide accurate information when registering.</li>
              <li>You are responsible for maintaining the security of your account credentials.</li>
              <li>You must be at least 13 years old to use GoCast.</li>
              <li>One person may not maintain more than one free account.</li>
              <li>
                You are responsible for all activity that occurs under your account, including
                content broadcast through your stations.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">4. Content Guidelines</h2>
            <p className="mb-3">
              You retain ownership of all content you broadcast or upload. By using GoCast, you grant
              us a limited license to transmit, cache, and distribute your content solely for the
              purpose of operating the service.
            </p>
            <p className="mb-3">You agree not to broadcast or upload content that:</p>
            <ul className="list-disc pl-5 flex flex-col gap-1.5">
              <li>Infringes on copyrights, trademarks, or other intellectual property rights.</li>
              <li>Contains hate speech, threats, harassment, or incitement to violence.</li>
              <li>Contains sexually explicit material involving minors.</li>
              <li>Promotes illegal activities or substances.</li>
              <li>Impersonates another person or entity.</li>
              <li>Contains malware, spam, or deceptive content.</li>
            </ul>
            <p className="mt-3">
              You are solely responsible for ensuring you have the rights to broadcast any music,
              audio, or other content through your station. This includes obtaining any necessary
              licenses from rights holders, performance rights organizations, or collecting societies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">5. Fair Use</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1.5">
              <li>Do not use the service to relay or rebroadcast content from other platforms without authorization.</li>
              <li>Do not use automated tools to create stations, inflate listener counts, or abuse the platform.</li>
              <li>Do not attempt to circumvent rate limits, authentication, or access controls.</li>
              <li>Do not interfere with other users&apos; broadcasts or the operation of the service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">6. Free and Paid Plans</h2>
            <p>
              GoCast offers both free and paid plans. Free plans are subject to limitations on the
              number of stations, concurrent listeners, and audio quality. Paid plans offer higher
              limits and additional features as described on the pricing page.
            </p>
            <ul className="list-disc pl-5 flex flex-col gap-1.5 mt-3">
              <li>Paid subscriptions are billed monthly and renew automatically.</li>
              <li>You may cancel at any time — your plan remains active until the end of the billing period.</li>
              <li>Refunds are not provided for partial billing periods.</li>
              <li>We reserve the right to change pricing with 30 days&apos; notice.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">7. Termination</h2>
            <p>
              We may suspend or terminate your account if you violate these terms, engage in abusive
              behavior, or if required by law. You may delete your account at any time from the
              dashboard — this will permanently remove your stations, broadcast history, and
              associated data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">8. Service Availability</h2>
            <p>
              We aim to keep GoCast available at all times but do not guarantee uninterrupted service.
              We may perform maintenance, updates, or experience outages. We are not liable for any
              loss or damage resulting from service interruptions, including dropped broadcasts or
              lost listener connections.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">9. Limitation of Liability</h2>
            <p>
              GoCast is provided &ldquo;as is&rdquo; without warranties of any kind, express or implied. To the
              fullest extent permitted by law, we shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages, including but not limited to loss of
              revenue, data, or business opportunities arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">10. DMCA and Copyright</h2>
            <p>
              We respect intellectual property rights. If you believe content on GoCast infringes
              your copyright, please contact us with:
            </p>
            <ul className="list-disc pl-5 flex flex-col gap-1.5 mt-2">
              <li>A description of the copyrighted work.</li>
              <li>The station URL where the infringing content was broadcast.</li>
              <li>Your contact information.</li>
              <li>A statement that you have a good-faith belief the use is unauthorized.</li>
              <li>A statement under penalty of perjury that your notice is accurate.</li>
            </ul>
            <p className="mt-3">
              Send takedown notices to{" "}
              <a href="mailto:dmca@gocast.fm" className="text-primary no-underline hover:underline">
                dmca@gocast.fm
              </a>.
              We will respond promptly and may disable the station pending resolution.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">11. Privacy</h2>
            <p>
              Your use of GoCast is also governed by our{" "}
              <Link href="/privacy" className="text-primary no-underline hover:underline">
                Privacy Policy
              </Link>,
              which describes how we collect, use, and protect your data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">12. Governing Law</h2>
            <p>
              These terms are governed by the laws of the jurisdiction in which GoCast operates.
              Any disputes arising from these terms or your use of the service shall be resolved
              through binding arbitration, except where prohibited by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-foreground mb-3">13. Contact</h2>
            <p>
              For questions about these terms, contact us at{" "}
              <a href="mailto:legal@gocast.fm" className="text-primary no-underline hover:underline">
                legal@gocast.fm
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
