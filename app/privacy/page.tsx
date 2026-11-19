import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/legal/legal-page'
import { LEGAL, SUBPROCESSORS } from '@/lib/legal'

export const metadata: Metadata = { title: 'Privacy Policy', description: 'How Trefort collects, uses and protects personal information.' }
export const dynamic = 'force-static'

export default function PrivacyPage() {
  const { operator, product, privacyEmail } = LEGAL
  return (
    <LegalPage
      title="Privacy Policy"
      summary={`In short: we collect what we need to run ${product} for your company. We don't sell personal information or use your project data to train AI. We share it only with the service providers listed below. You can ask to see, correct or delete your information at any time.`}
    >
      <section>
        <h2>1. Who this policy covers</h2>
        <p>
          {`This policy explains how ${operator} ("we", "us") handles personal information in ${product}: the web app, mobile app, client portal and subcontractor portal.`}
        </p>
        <p>
          {`${product} is used by construction companies (our "Customers") to manage their projects. When a Customer adds its clients, employees or subcontractors, the Customer decides what information goes in and why. In that case we process the information on the Customer's behalf and under its instructions. If you are a homeowner or subcontractor and have questions about your information, you can contact the builder you work with or reach us directly.`}
        </p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <ul>
          <li><strong>Account information:</strong> name, email address, phone number, job title, password (stored only in hashed form) and profile photo.</li>
          <li><strong>Company information:</strong> company name, address, logo, business settings and billing contact.</li>
          <li>
            <strong>Project data entered by users:</strong> clients and contacts, addresses, estimates, invoices, payments recorded, schedules, daily
            logs, photos, documents, messages, selections and signatures.
          </li>
          <li>
            <strong>Billing information:</strong> plan, billing interval and payment status. Card details are collected and stored by Stripe, not by us.
          </li>
          <li>
            <strong>Usage and device information:</strong> sign-in times, IP address, browser and device type, pages visited and error reports. These
            are used for security, troubleshooting and improving the product.
          </li>
          <li>
            <strong>Location:</strong> project addresses. If you allow it, the dashboard uses your device&apos;s approximate location once to show
            local weather. We do not track device location in the background.
          </li>
          <li>
            <strong>Offline data on your device:</strong> to work without a signal, the app stores recently opened pages and unsent entries on your
            device. Signing out clears saved pages.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. How we use information</h2>
        <ul>
          <li>to provide the Service: run workspaces, send invitations and notifications, sync offline work and generate documents;</li>
          <li>to bill subscriptions and prevent fraud;</li>
          <li>to secure the Service, investigate abuse and keep audit trails of important changes;</li>
          <li>to provide support and send service messages, such as trial reminders, receipts and security notices;</li>
          <li>to understand feature usage in aggregate and improve the product;</li>
          <li>to comply with the law.</li>
        </ul>
        <p>
          We do not sell or rent personal information, and we do not share it for cross-context behavioral advertising. We do not use Customer project
          data to train AI models.
        </p>
      </section>

      <section>
        <h2>4. AI features</h2>
        <p>
          When a company uses AI features, the relevant records (for example the project, estimate or quote being analyzed) are sent to our AI provider
          to generate a response. The data is processed only to answer that request. The provider is not permitted to use it to train its models.
          Companies can turn AI features off in their settings.
        </p>
      </section>

      <section>
        <h2>5. Who we share information with</h2>
        <p>We share information only with:</p>
        <ul>
          <li>people in the same company workspace, according to the roles and permissions the Customer sets;</li>
          <li>clients and subcontractors, for the items a Customer chooses to share with them through the portals;</li>
          <li>the service providers below, who process data for us under contract and only for the stated purpose;</li>
          <li>authorities, when the law requires it or when needed to protect rights, safety or the Service;</li>
          <li>a buyer or successor, if our business is sold or merged. This policy would continue to apply.</li>
        </ul>
        <div className="overflow-x-auto rounded-[8px] border">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Provider</th>
                <th scope="col" className="px-3 py-2 font-medium">Purpose</th>
                <th scope="col" className="px-3 py-2 font-medium">Location</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((p) => (
                <tr key={p.name} className="border-t align-top">
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.purpose}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>6. How we protect information</h2>
        <p>
          Data is encrypted in transit (HTTPS) and at rest. Each company&apos;s data is kept separate by database-level access rules, so one company
          cannot read another&apos;s records. Access within a company follows the roles its administrators assign. No system is perfectly secure. If a
          breach affects your personal information, we will notify you as the law requires.
        </p>
      </section>

      <section>
        <h2>7. How long we keep information</h2>
        <p>
          We keep Customer Data while the Customer&apos;s account is active. After an account is closed, the data is available for export for 30 days.
          It is then deleted, except for records we must keep by law (such as billing records) and backups, which expire on their normal schedule.
        </p>
      </section>

      <section>
        <h2>8. Your choices and rights</h2>
        <ul>
          <li>You can view and update your profile at any time in the app.</li>
          <li>You can choose which email notifications you receive in your notification settings. Security and billing messages are always sent.</li>
          <li>
            Depending on where you live (for example California, Colorado, Virginia or the EU/UK), you may have the right to access, correct, delete or
            export your personal information, and to object to or limit certain processing. We will not treat you differently for exercising these
            rights.
          </li>
          <li>
            To make a request, email <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>. If your information was added by a builder you work with, we
            may refer your request to them, because they control that data.
          </li>
        </ul>
      </section>

      <section>
        <h2>9. Children</h2>
        <p>{`${product} is a business tool and is not directed to children. We do not knowingly collect personal information from anyone under 16.`}</p>
      </section>

      <section>
        <h2>10. Where information is processed</h2>
        <p>
          We and our service providers process information in the United States. If you use the Service from outside the US, your information will be
          transferred to and processed in the US.
        </p>
      </section>

      <section>
        <h2>11. Changes to this policy</h2>
        <p>
          We will post updates here and change the effective date. If a change is material, we will notify account administrators by email or in the
          app before it takes effect.
        </p>
      </section>

      <section>
        <h2>12. Contact</h2>
        <p>
          Privacy questions or requests: <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>. You can also read our{' '}
          <Link href="/terms">Terms of Service</Link>.
        </p>
      </section>
    </LegalPage>
  )
}
