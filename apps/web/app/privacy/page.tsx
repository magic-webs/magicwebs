import type { Metadata } from "next"

import { LEGAL_CONTACT, LegalPage } from "@/components/legal/legal-page"

export const metadata: Metadata = {
  title: "Privacy Policy · Magicwebs",
  description: "What Magicwebs collects, why, who processes it, and how to have it deleted.",
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="12 November 2026">
      <p>
        Magicwebs (&ldquo;we&rdquo;, &ldquo;us&rdquo;) lets you copy or rebuild a website, edit it in a visual editor, with
        AI chat or from an MCP client, and publish it to your own domain. This policy explains what we collect when you use
        build.magicwebs.ai, our API and MCP server, and the sites published with Magicwebs, and what we do with it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details.</strong> When you sign in with Google we receive your name, email address and profile
          picture. When you sign in with a Magic Agent account we receive the same details from Magic Agent. We use them only
          to create your account, sign you in and contact you about it.
        </li>
        <li>
          <strong>Your content.</strong> The websites you ask us to copy, the pages, drafts, versions, images, blog posts and
          chat messages you create, the domains you connect, and the API keys you issue.
        </li>
        <li>
          <strong>Form submissions on published sites.</strong> When a visitor fills in a form on a site published with
          Magicwebs, we store what they entered (for example name, email, phone and message) for the site&rsquo;s owner, and
          a one-way hash of their IP address and the day, used only to stop spam.
        </li>
        <li>
          <strong>Site analytics.</strong> For published sites we record page views: the page, the referring site, campaign
          tags, approximate country and city, device type, browser, operating system, time on page and scroll depth. Visitors
          are counted with an anonymous identifier, not a name or email address.
        </li>
        <li>
          <strong>Technical logs.</strong> Our servers log requests and errors so we can keep the service running and secure.
        </li>
      </ul>

      <h2>Google user data</h2>
      <p>
        If you sign in with Google, we request only the basic scopes needed to identify you (<code>openid</code>,{" "}
        <code>email</code> and <code>profile</code>). We do not access your Gmail, Drive, Calendar or any other Google data.
        Information received from Google is used only to sign you in and run your account, is never sold, is never used for
        advertising, and is never used to train AI models. Our use of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>To provide the service: copy and rebuild sites, save your edits, publish them and serve them on your domain.</li>
        <li>To deliver form submissions and show analytics to the owner of each site.</li>
        <li>To keep the service secure, prevent abuse and fix problems.</li>
        <li>To tell you about changes to your account or to these policies.</li>
      </ul>
      <p>We do not sell personal information and we do not show ads.</p>

      <h2>Who processes it</h2>
      <p>We use a small number of providers to run Magicwebs. Each handles data only to provide its service to us:</p>
      <ul>
        <li>
          <strong>Convex</strong>: our database and backend.
        </li>
        <li>
          <strong>Cloudflare</strong>: file storage (R2) and delivery of published sites.
        </li>
        <li>
          <strong>Anthropic</strong>: the AI model that carries out edits you ask for in chat. It receives the page being
          edited and your instructions. Anthropic does not train its models on this data.
        </li>
        <li>
          <strong>Google</strong> and <strong>Magic Agent</strong>: sign-in, if you choose them.
        </li>
      </ul>
      <p>We may also disclose information when the law requires it, or to protect the rights and safety of our users.</p>

      <h2>Cookies</h2>
      <p>
        We use cookies and local storage to keep you signed in and remember your preferences. We do not use advertising or
        cross-site tracking cookies.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        We keep your account and content while your account is open. You can delete projects, form submissions and API keys
        at any time from the dashboard. To delete your account and everything in it, email{" "}
        <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> and we will do so within 30 days, apart from anything we must
        keep by law. You can also revoke Magicwebs&rsquo; access to your Google account at any time from your{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          Google account permissions
        </a>
        .
      </p>

      <h2>Owners of published sites</h2>
      <p>
        If you publish a site with Magicwebs, you decide what its forms collect and you are responsible for telling your
        visitors how you use their information. Visitors who want their submission removed should contact the site&rsquo;s
        owner; owners can delete submissions from the dashboard.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct, export or delete your personal information,
        or to object to how it is used. Email <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> and we will respond
        within 30 days.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit, access to production systems is restricted, and API keys are stored as hashes. No
        service is perfectly secure, but we work to protect your information and will tell you promptly if a breach affects
        it.
      </p>

      <h2>Children</h2>
      <p>Magicwebs is not intended for anyone under 16, and we do not knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>
        We will post any changes on this page and update the date above. If a change is significant, we will also tell you by
        email or in the app.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy or your data: <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
      </p>
    </LegalPage>
  )
}
