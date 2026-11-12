import type { Metadata } from "next"
import Link from "next/link"

import { LEGAL_CONTACT, LegalPage } from "@/components/legal/legal-page"

export const metadata: Metadata = {
  title: "Terms of Service · Magicwebs",
  description: "The terms for using Magicwebs to copy, edit and publish websites.",
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="12 November 2026">
      <p>
        These terms govern your use of Magicwebs, including build.magicwebs.ai, our API, our MCP server and the sites you
        publish with it (together, the &ldquo;Service&rdquo;). By creating an account or using the Service you agree to them.
        If you use the Service for an organisation, you agree on its behalf.
      </p>

      <h2>Your account</h2>
      <p>
        You need an account to use most of the Service. Keep your sign-in and API keys secure: you are responsible for what
        happens under your account, including actions taken by agents and MCP clients you connect with your keys. Tell us
        straight away if you think your account has been compromised.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of everything you create or upload. You give us permission to host, copy, process, display and
        publish it only as needed to run the Service for you, including sending it to our AI provider when you ask for an
        edit.
      </p>

      <h2>Copying websites</h2>
      <p>
        Magicwebs can copy any website you point it at. You may only copy, rebuild and publish sites that you own or have
        permission to use. You are responsible for making sure the text, images, logos, trademarks and code on your published
        pages do not infringe anyone else&rsquo;s rights. We may remove published content when we receive a valid complaint
        that it infringes someone&rsquo;s rights; send complaints to{" "}
        <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
      </p>

      <h2>Acceptable use</h2>
      <p>You must not use the Service to:</p>
      <ul>
        <li>impersonate another person or business, or publish phishing or other deceptive pages;</li>
        <li>publish content that is illegal, fraudulent, hateful or harassing, or that exploits children;</li>
        <li>distribute malware, send spam, or collect people&rsquo;s information without a lawful basis;</li>
        <li>overload, probe or break the Service, or get around usage limits or security measures;</li>
        <li>resell or provide the Service to others as your own without our written permission.</li>
      </ul>
      <p>We may suspend or remove content or accounts that break these rules.</p>

      <h2>Published sites and forms</h2>
      <p>
        You are the publisher of the sites you publish. If your forms collect visitors&rsquo; information, you are responsible
        for having a privacy notice and handling that information lawfully. Our{" "}
        <Link href="/privacy">Privacy Policy</Link> explains what we do with it on your behalf.
      </p>

      <h2>Custom domains</h2>
      <p>
        You must own or control any domain you connect. You are responsible for its registration and DNS settings; we are not
        responsible for downtime caused by changes to them.
      </p>

      <h2>AI output</h2>
      <p>
        Edits and content produced by AI can be wrong or unexpected. Review your pages before publishing them. Every publish
        is saved as a version, so you can roll back.
      </p>

      <h2>Plans and usage</h2>
      <p>
        Some features may have usage limits or require a paid plan. If you buy a paid plan, its price and billing terms are
        shown when you buy it. We may change prices with reasonable notice; changes do not affect a period you have already
        paid for.
      </p>

      <h2>Availability and changes</h2>
      <p>
        We work to keep the Service available but do not guarantee it will be uninterrupted or error-free. We may change,
        add or remove features. If we discontinue the Service, we will give reasonable notice so you can export your content.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can stop using the Service and ask us to delete your account at any time. We may suspend or close accounts that
        break these terms or put the Service or other users at risk. When an account is closed its published sites stop being
        served.
      </p>

      <h2>Disclaimers</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, to the
        extent the law allows.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent the law allows, Magicwebs is not liable for indirect, incidental or consequential losses, or for lost
        profits, revenue or data. Our total liability for any claim relating to the Service is limited to the greater of the
        amount you paid us in the 12 months before the claim and USD 100.
      </p>

      <h2>Indemnity</h2>
      <p>
        You agree to cover our reasonable costs if a third party brings a claim against us arising from your content, the
        sites you publish, or your breach of these terms.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of India, and the courts of India have jurisdiction over any dispute about them,
        without affecting any mandatory consumer protections where you live.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We will post changes on this page and update the date above. If a change is significant, we will tell you in advance
        by email or in the app. Continuing to use the Service after a change takes effect means you accept it.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
      </p>
    </LegalPage>
  )
}
