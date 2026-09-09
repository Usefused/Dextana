import dextLogo from '../assets/dext-logo.svg?url&no-inline';
import { useState } from 'react';
import { BrandName, BrandLockup, FusedLink, brandName, fusedUrl } from '../Brand';
import type { MetaFunction } from '@remix-run/node';
import { downloads, examples, questions } from '../content';

const description = 'Dextana by Fused works across your browser, files, and connected apps. Choose your model, run tasks in parallel, and schedule work with permissions you control.';
export const meta: MetaFunction = () => [
  { title: `${brandName} — For people with work to get done.` },
  { name: 'description', content: description },
  { name: 'application-name', content: brandName },
  { name: 'author', content: 'Fused' },
  { name: 'apple-mobile-web-app-title', content: brandName },
  { property: 'og:site_name', content: brandName },
  { property: 'og:title', content: `${brandName} — For people with work to get done.` },
  { property: 'og:description', content: description },
  { property: 'og:type', content: 'website' },
  { name: 'twitter:card', content: 'summary' },
  { name: 'twitter:title', content: brandName },
  { name: 'twitter:description', content: description },
  { 'script:ld+json': {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: brandName,
    alternateName: ['Dextana', 'Dext'],
    description,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'macOS, Windows, Linux',
    publisher: { '@type': 'Organization', name: 'Fused', url: fusedUrl },
  } },
];

const Arrow = () => <span aria-hidden="true">↗</span>;

function LinkedFusedText({ text }: { text: string }) {
  return <>{text.split(/\b(Fused)\b/g).map((part, index) => part === 'Fused' ? <FusedLink key={index} /> : part)}</>;
}


function WorkPreview() {
  return <div className="work-preview" aria-label="Illustrative example of planning work in Dextana by Fused">
    <div className="window-bar"><div className="window-dots" aria-hidden="true"><i /><i /><i /></div><BrandName /><span className="window-symbol" aria-hidden="true">⊞</span></div>
    <div className="preview-body">
      <div className="preview-heading"><img src={dextLogo} alt="" width="35" height="35" /><div><strong>Add a supplier</strong><span>From a website to your connected tools.</span></div><span className="example-tag">Example</span></div>
      <div className="user-prompt">Read this supplier’s contact page and prepare a contact in my connected CRM. Let me review the details before saving.</div>
      <div className="dex-response"><span className="dex-avatar" aria-hidden="true">D</span><div><strong>I’ll gather the details first.</strong><p>I can read the page in the browser, then use your enabled integration to prepare the contact.</p></div></div>
      <div className="worker-list"><div><span className="worker-icon" aria-hidden="true">▤</span><div><strong>Read the supplier’s details</strong><span>In-app browser · Contact page</span></div><span className="status-dot" /></div><div><span className="worker-icon" aria-hidden="true">◎</span><div><strong>Prepare the contact</strong><span>CRM integration · Awaiting your review</span></div><span className="status-dot" /></div></div>
      <div className="approval-note"><span aria-hidden="true">✓</span><p><strong>Review before saving.</strong><br />Approve the contact details before they are sent.</p></div>
      <div className="preview-composer"><span>A little more context for Dext…</span><span aria-hidden="true">↑</span></div>
    </div>
    <div className="preview-footer"><span><i /> Models you choose</span><span>Saved on your computer</span></div>
  </div>;
}

function ExampleCard({ example }: { example: typeof examples[number] }) {
  const [copyState, setCopyState] = useState('Copy example');
  async function copy() {
    try { await navigator.clipboard.writeText(example.prompt); setCopyState('Copied'); }
    catch { setCopyState('Select the example to copy'); }
  }
  return <article className="example-card"><div className="card-top"><span className="feature-icon" aria-hidden="true">{example.icon}</span><span>{example.number}</span></div><p className="eyebrow">{example.kind}</p><h3>{example.title}</h3><p>{example.description}</p><div className="prompt-example"><span className="prompt-label">TRY ASKING DEXT</span><p>“{example.prompt}”</p><button onClick={copy} type="button"><span aria-live="polite">{copyState}</span><span aria-hidden="true">{copyState === 'Copied' ? '✓' : '↗'}</span></button></div></article>;
}

const platforms = downloads.platforms;

function PlatformDownload() {
  const [platform, setPlatform] = useState<keyof typeof platforms | ''>('');
  const selected = platform ? platforms[platform] : null;
  const available = selected && Date.now() < Date.parse(selected.expiresAt);
  return <div className="platform-picker" role="group" aria-label="Download Dextana by Fused">
    <label htmlFor="download-platform">Choose your operating system</label>
    <select id="download-platform" value={platform} onChange={event => setPlatform(event.target.value as keyof typeof platforms)} aria-describedby="platform-details">
      <option value="" disabled>Select macOS, Windows, or Linux</option>
      {Object.entries(platforms).map(([value, option]) => <option key={value} value={value}>{option.name}</option>)}
    </select>
    <div id="platform-details" className="platform-details" aria-live="polite">
      {selected ? <><strong>Version {selected.version} · {selected.architecture}</strong><span>{selected.format}. {available ? selected.instructions : 'This installer package has expired. No current download is available for this platform.'}</span></> : <span>Select your operating system to show its download button.</span>}
    </div>
    {selected && available && <a className="button platform-cta" href={selected.url}>Download for {selected.name} <span aria-hidden="true">↓</span></a>}
    <noscript><p className="download-help">Download an installer package: <a href={platforms.macos.url}>macOS (Apple silicon)</a>, <a href={platforms.windows.url}>Windows (x64)</a>, or <a href={platforms.linux.url}>Linux (x64)</a>.</p></noscript>
  </div>;
}

export default function Index() {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header wrap"><BrandLockup alpha /><nav aria-label="Main navigation"><a href="#possibilities">What Dext can do</a><a href="#how-it-works">How it works</a><a href="#integrations" className="source-link">Integrations</a></nav><a className="button nav-download" href="#download">Get Dextana <span aria-hidden="true">↓</span></a></header>
    <main id="main">
      <section className="hero wrap" aria-labelledby="hero-title"><div className="hero-copy"><div className="hero-eyebrow"><span className="live-dot" /><BrandName /></div><h1 id="hero-title">For people<br />with work<br /><em>to get done.</em></h1><p className="hero-description"><BrandName /> brings your browser, files, and connected apps together to get the admin done. Research, organise, create, and follow through—with the model and permissions you choose.</p><div className="hero-actions"><a className="button primary" href="#download">Get Dextana <span aria-hidden="true">↓</span></a><a className="text-link" href="#possibilities">See example tasks <span aria-hidden="true">→</span></a></div><p className="platform-note">macOS, Windows & Linux <span>·</span> Your choice of model</p></div><div className="hero-visual"><div className="visual-label"><span aria-hidden="true">✳</span> “For those who hate admin tasks.”</div><WorkPreview /><div className="visual-caption"><span aria-hidden="true">↳</span> Give Dext a task, follow its progress, and review the result.</div></div></section>
      <div className="principles wrap"><div><span aria-hidden="true">◉</span> Your work saved locally</div><div><span aria-hidden="true">⌘</span> Your choice of AI</div><div><span aria-hidden="true">⊞</span> In-app browser</div><div><span aria-hidden="true">↗</span> <a href={fusedUrl}>Connected apps via Fused</a></div></div>
      <section className="possibilities section wrap" id="possibilities" aria-labelledby="possibilities-title"><div className="section-heading"><div><p className="eyebrow">EXAMPLE TASKS</p><h2 id="possibilities-title">Browser and tools.<br />Working together.</h2></div><p>Give Dext the outcome you need.<br />It can work through the steps across<br />websites, documents, and connected tools.</p></div><div className="example-grid">{examples.map(example => <ExampleCard key={example.number} example={example} />)}</div></section>
      <section className="section wrap context-section" id="context" aria-labelledby="context-title">
        <div className="context-copy"><p className="eyebrow">CONTEXT FOR THE TASK</p><h2 id="context-title">Add the files.<br />Explain the task.</h2><p>Add the notes, numbers, and instructions Dext needs. Explain the outcome you want and any constraints it should work within.</p><ul className="context-points"><li><strong>Bring your files and links.</strong><span>Bring PDFs, Word documents, spreadsheets, notes, images, and links into the task. Ask Dext to compare, extract, summarise, or turn the details into a new document.</span></li><li><strong>Choose what Dext can read.</strong><span>Choose the files Dext can use and how much access to allow. Keep control as the task moves forward.</span></li><li><strong>Keep adding the details.</strong><span>Send follow-ups to clarify priorities or change direction. Keep the useful files and links together in the Context panel.</span></li></ul><a className="text-link" href={'/guide#context'}>How to give Dext context <Arrow /></a></div>
        <div className="context-example" aria-label="Illustrative example of adding context in Dextana by Fused"><div className="context-example-heading"><strong>A moving plan, with your context.</strong><span className="example-tag">Example</span></div><div className="context-message">Use my moving notes and budget to draft a checklist. Keep it within £2,000 and flag anything I still need to decide.</div><div className="context-file"><span aria-hidden="true">▤</span><div><strong>moving-notes.md</strong><small>Attached · ready for the task</small></div></div><div className="context-file"><span aria-hidden="true">▦</span><div><strong>budget.xlsx</strong><small>Attached · ready for the task</small></div></div><div className="context-followup"><span className="eyebrow">ONE MORE THING…</span><p>“I’m working until Friday. Put anything that needs a full day on the weekend.”</p></div><p className="context-example-note">Files and follow-up instructions stay with the activity.</p></div>
      </section>
      <section className="control-section" aria-labelledby="control-title"><div className="wrap control-grid"><div><p className="eyebrow">PRIVACY AND PERMISSIONS</p><h2 id="control-title">Choose your model.<br /><em>Control your data.</em></h2><p>Use AI that runs on your computer, or connect a cloud provider you trust. You decide which files, websites, and tools Dext can use.</p><a href={'/guide#privacy'} className="text-link">Explore how Dextana works <Arrow /></a></div><div className="control-points"><article><span>01</span><div><h3>Choose the model that does the work.</h3><p>Pick the AI that suits your needs and change it as you work. Choose local processing for more privacy, or a cloud model for the task at hand.</p></div></article><article><span>02</span><div><h3>Review the plan. Approve the action.</h3><p>Agree on the steps and resources in Plan mode, or get started in Work mode. Approve individual actions or set permissions for the chat.</p></div></article><article><span>03</span><div><h3>Keep your work close.</h3><p>Your chats, plans, and schedules save on your computer. Cloud models receive task context; websites and integrations receive the information needed for their actions.</p></div></article></div></div></section>
      <section className="section wrap integrations-section" id="integrations" aria-labelledby="integrations-title"><div className="section-heading"><div><p className="eyebrow">SERVICE INTEGRATIONS</p><h2 id="integrations-title">Less copying.<br />More getting done.</h2></div><p>Bring your everyday apps into the task<br />with <FusedLink />. You choose what Dext<br />can access and do.</p></div><div className="integration-grid"><div className="integration-flow" aria-label="Your apps connect through Fused to Dextana"><div><span className="flow-kicker">YOUR APPS</span><strong>Your tools</strong><span>The services you use</span></div><span className="flow-arrow" aria-hidden="true">→</span><div><span className="flow-kicker">THE CONNECTION</span><strong><FusedLink /></strong><span>Connected to Dext</span></div><span className="flow-arrow" aria-hidden="true">→</span><div><span className="flow-kicker">YOUR WORKSPACE</span><strong>Dextana</strong><span>Work gets done</span></div></div><div className="integration-copy"><h3>Use the browser and integrations in one task.</h3><p>Ask Dext to find the details on a website, add them to a connected app, and put together a summary. One task, with less copying and switching back and forth.</p><p><FusedLink /> connects Dext to the services you use. Once connected, you choose which actions to allow. Start with the apps you need and add more as you go.</p><a className="text-link" href="/guide#integrations">Connect your apps <Arrow /></a><p><a className="text-link" href="https://docs.usefused.com/introduction">Read the integration docs <Arrow /></a></p></div></div></section>
      <section className="section wrap getting-started" id="how-it-works" aria-labelledby="setup-title"><div className="section-heading"><div><p className="eyebrow">GETTING STARTED</p><h2 id="setup-title">Set up Dextana.</h2></div><p>Get started with <BrandName />.<br />Connect a model and try a task<br />you need help with.</p></div><ol className="steps"><li><span className="step-number">1</span><h3>Install Dextana.</h3><p>Choose the download for your computer and follow the installation guide.</p><a href="#download">Find your download <span aria-hidden="true">↓</span></a></li><li><span className="step-number">2</span><h3>Choose your AI.</h3><p>Connect an AI provider you trust, or use a model that runs on your computer. The guide walks you through both options.</p><a href={'/guide#models'}>Choose and connect your AI <Arrow /></a></li><li><span className="step-number">3</span><h3>Give Dext an assignment.</h3><p>Describe the result you need and add your files or links. Start now, split independent work into parallel assignments, or schedule it for later.</p><a href="#possibilities">Try an example <span aria-hidden="true">↑</span></a></li></ol></section>
      <section className="download-section wrap" id="download" aria-labelledby="download-title"><div className="download-intro"><img src={dextLogo} alt="" width="64" height="64" /><p className="eyebrow"><BrandName /></p><h2 id="download-title">Try Dextana<br />with a real task.</h2><p>Bring Dext to your desktop.<br />Choose your platform to download the installer package.</p><span className="download-badge"><span className="live-dot" /> DESKTOP ALPHA</span></div><div className="download-options"><p className="download-help">Dextana is in alpha. These packages do not include every feature yet. <a href="/guide#installation">Read the download and setup guide</a> before getting started.</p><PlatformDownload /><p className="download-help">These links open the platform installer packages.</p><p className="download-help">The <a href="/license.txt">Dextana No-Resale License</a> permits personal and business use. Reselling the app or its installer packages requires written permission from <FusedLink />.</p><p className="download-help">These alpha packages are not Apple-notarized or Windows verified-publisher releases. <a href={downloads.guide}>Read the installation notes <Arrow /></a></p></div></section>
      <section className="section wrap faq-section" aria-labelledby="faq-title"><div><p className="eyebrow">A FEW THINGS TO KNOW</p><h2 id="faq-title">Common<br />questions.</h2></div><div className="faq-list">{questions.map(item => <details key={item.question}><summary>{item.question}<span aria-hidden="true">+</span></summary><p><LinkedFusedText text={item.answer} /></p></details>)}</div></section>
    </main>
    <footer className="site-footer wrap"><div><BrandLockup /><p>A desktop assistant for getting work done.</p><p className="ownership">Dextana is owned by <FusedLink />.</p></div><div className="footer-links"><a href="/guide">Getting started <Arrow /></a><a href="/license.txt">License & usage <Arrow /></a></div><span className="footer-note">Work done. On your terms.</span></footer>
  </>;
}
