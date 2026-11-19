import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/legal/legal-page'
import { LEGAL } from '@/lib/legal'

export const metadata: Metadata = { title: 'Terms of Service', description: 'The terms that govern use of Trefort.' }
export const dynamic = 'force-static'

export default function TermsPage() {
  const { operator, product, contactEmail } = LEGAL
  return (
    <LegalPage
      title="Terms of Service"
      summary={`In short: your company owns the project data it puts into ${product}. You pay for the plan you choose, you can cancel any time, and you can export your data. We keep the service secure and available, but it is provided as is, and our liability is limited to what you paid us in the last 12 months.`}
    >
      <section>
        <h2>1. Who we are and what these terms cover</h2>
        <p>
          {`${product} is construction management software operated by ${operator} ("we", "us"). These Terms of Service ("Terms") govern access to and use of the ${product} web application, mobile app, client portal and related services (the "Service").`}
        </p>
        <p>
          {`By creating an account, accepting an invitation or using the Service, you agree to these Terms. If you use the Service for a company, you confirm you are authorized to accept these Terms for that company, and "you" includes that company (the "Customer").`}
        </p>
      </section>

      <section>
        <h2>2. Accounts and access</h2>
        <ul>
          <li>You must give accurate information and keep your sign-in details confidential. You are responsible for activity under your account.</li>
          <li>
            A Customer&apos;s administrators control who can join their workspace, which features are on, and what each person can see. Staff, clients and
            subcontractors invited by a Customer use the Service under that Customer&apos;s account.
          </li>
          <li>You must be at least 18 years old to create an account.</li>
          <li>Tell us right away at {contactEmail} if you believe your account has been accessed without permission.</li>
        </ul>
      </section>

      <section>
        <h2>3. Free trial, plans and billing</h2>
        <ul>
          <li>New companies may receive a free trial. No payment card is needed to start it. When the trial ends, the workspace is paused until an administrator chooses a plan. Your data is not deleted.</li>
          <li>Paid plans are billed in advance, monthly or yearly, through our payment processor, Stripe. Subscriptions renew automatically until cancelled.</li>
          <li>Upgrades take effect immediately and are prorated. Seat limits and included features depend on the plan shown on the Plan &amp; billing page.</li>
          <li>You can cancel at any time from Plan &amp; billing. Cancellation takes effect at the end of the current billing period. Fees already paid are not refunded, except where the law requires it.</li>
          <li>Prices are in US dollars and exclude taxes, which you are responsible for. We will give at least 30 days&apos; notice before changing the price of an existing subscription.</li>
        </ul>
      </section>

      <section>
        <h2>4. Your data</h2>
        <ul>
          <li>
            The Customer owns everything it and its users put into the Service: projects, clients, estimates, invoices, schedules, logs, photos and
            documents (&quot;Customer Data&quot;).
          </li>
          <li>
            You give us permission to host, process, back up and display Customer Data only as needed to provide, secure and support the Service. We do
            not sell Customer Data and do not use it to train AI models.
          </li>
          <li>
            You are responsible for having the right to upload Customer Data, including information about your clients, employees and subcontractors,
            and for giving them any notices the law requires.
          </li>
          <li>How we handle personal information is described in our <Link href="/privacy">Privacy Policy</Link>.</li>
        </ul>
      </section>

      <section>
        <h2>5. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>break the law, infringe others&apos; rights, or upload content you do not have the right to share;</li>
          <li>upload malware, probe or attack the Service, or try to access another company&apos;s workspace or data;</li>
          <li>scrape, resell or rent the Service, or use it to build a competing product;</li>
          <li>send spam or unwanted messages through the Service&apos;s email or invitation features;</li>
          <li>get around plan limits, seat limits or security controls.</li>
        </ul>
        <p>We may suspend access that puts the Service, other customers or the public at risk. Where reasonable, we will tell you first.</p>
      </section>

      <section>
        <h2>6. AI features, e-signatures and third-party services</h2>
        <ul>
          <li>
            AI features such as the assistant, estimate drafts and quote analysis produce suggestions that can be wrong. Review them before relying on
            them. You remain responsible for prices, schedules, contracts and decisions.
          </li>
          <li>
            Electronic signatures are provided through a third-party signing service. You are responsible for deciding whether an electronic signature
            is suitable for a particular document.
          </li>
          <li>
            Integrations with other services (for example accounting or storage tools) are governed by those providers&apos; own terms. We are not
            responsible for third-party services.
          </li>
          <li>
            The Service is a project management tool. It does not provide legal, tax, accounting, engineering or code-compliance advice.
          </li>
        </ul>
      </section>

      <section>
        <h2>7. Availability, changes and beta features</h2>
        <p>
          We work to keep the Service available and secure, but it may sometimes be interrupted for maintenance or for reasons outside our control. We
          may improve, change or remove features. Features labeled beta, preview or early access are offered as is and may change or end.
        </p>
      </section>

      <section>
        <h2>8. Ending the agreement and exporting data</h2>
        <ul>
          <li>You may stop using the Service and cancel your subscription at any time.</li>
          <li>We may suspend or end an account for serious or repeated breach of these Terms, or for non-payment after notice.</li>
          <li>
            After cancellation or termination, you may request an export of Customer Data for 30 days. After that, we may delete it, except for records
            we must keep by law and backups that expire on their normal schedule.
          </li>
        </ul>
      </section>

      <section>
        <h2>9. Disclaimers</h2>
        <p>
          The Service is provided &quot;as is&quot; and &quot;as available&quot;. To the fullest extent the law allows, we disclaim all implied warranties,
          including merchantability, fitness for a particular purpose and non-infringement. We do not promise that the Service will be error-free or
          uninterrupted.
        </p>
      </section>

      <section>
        <h2>10. Limitation of liability</h2>
        <p>
          To the fullest extent the law allows, neither party is liable for indirect, incidental, special, consequential or punitive damages, or for lost
          profits, revenue or data. Each party&apos;s total liability arising out of these Terms is limited to the amount the Customer paid us for the
          Service in the 12 months before the claim. These limits do not apply to a party&apos;s indemnity obligations, a Customer&apos;s payment
          obligations, or liability that cannot be limited by law.
        </p>
      </section>

      <section>
        <h2>11. Indemnity</h2>
        <p>
          The Customer will defend and indemnify us against third-party claims arising from Customer Data or from the Customer&apos;s breach of section 5.
          We will defend and indemnify the Customer against third-party claims that the Service, as we provide it, infringes their intellectual
          property rights.
        </p>
      </section>

      <section>
        <h2>12. Changes to these Terms</h2>
        <p>
          We may update these Terms. If a change is material, we will notify account administrators by email or in the app at least 30 days before it
          takes effect. Continuing to use the Service after that date means you accept the updated Terms.
        </p>
      </section>

      <section>
        <h2>13. General</h2>
        <p>
          {`These Terms are governed by the laws of the state in which ${operator} is organized and by applicable US federal law, without regard to conflict-of-law rules. If any part of these Terms is unenforceable, the rest stays in effect. These Terms, together with the Privacy Policy and any order form or plan terms, are the entire agreement between you and us about the Service.`}
        </p>
      </section>

      <section>
        <h2>14. Contact</h2>
        <p>
          Questions about these Terms: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        </p>
      </section>
    </LegalPage>
  )
}
