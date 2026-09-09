import dextLogo from '../assets/dext-logo.svg?url&no-inline';
import { useState } from 'react';
import { BrandName, BrandLockup, FusedLink, brandName, fusedUrl } from '../Brand';
import type { MetaFunction } from '@remix-run/node';
import { downloads, examples, questions, repository } from '../content';

const description = 'Dextana by Fused brings an in-app browser, connected services, and your choice of model together to help with everyday admin and get real work done.';
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
    alternateName: 'Dextana',
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
      <section className="hero wrap" aria-labelledby="hero-title"><div className="hero-copy"><div className="hero-eyebrow"><span className="live-dot" /><BrandName /></div><h1 id="hero-title">For people<br />with work<br /><em>to get done.</em></h1><p className="hero-description">Meet Dext. Choose the model that does the work. <BrandName /> brings an in-app browser and integrations together to help with admin, so you can focus on what matters.</p><div className="hero-actions"><a className="button primary" href="#download">Get Dextana <span aria-hidden="true">↓</span></a><a className="text-link" href="#possibilities">See example tasks <span aria-hidden="true">→</span></a></div><p className="platform-note">macOS, Windows & Linux <span>·</span> Your choice of model</p><p className="model-access-note">No OpenAI API key needed for local models.</p></div><div className="hero-visual"><div className="visual-label"><span aria-hidden="true">✳</span> “For those who hate admin tasks.”</div><WorkPreview /><div className="visual-caption"><span aria-hidden="true">↳</span> Give Dext a task, follow its progress, and review the result.</div></div></section>
      <div className="principles wrap"><div><span aria-hidden="true">◉</span> Local-first by design</div><div><span aria-hidden="true">⌘</span> Open-weight models</div><div><span aria-hidden="true">⊞</span> In-app browser</div><div><span aria-hidden="true">↗</span> <a href={fusedUrl}>OpenAPI services via Fused</a></div></div>
      <section className="possibilities section wrap" id="possibilities" aria-labelledby="possibilities-title"><div className="section-heading"><div><p className="eyebrow">EXAMPLE TASKS</p><h2 id="possibilities-title">Browser and tools.<br />Working together.</h2></div><p>Read a website, update a connected service,<br />or turn the details into a document.<br />Give Dext the outcome you need.</p></div><div className="example-grid">{examples.map(example => <ExampleCard key={example.number} example={example} />)}</div></section>
      <section className="section wrap context-section" id="context" aria-labelledby="context-title">
        <div className="context-copy"><p className="eyebrow">CONTEXT FOR THE TASK</p><h2 id="context-title">Add the files.<br />Explain the task.</h2><p>Add the notes, numbers, and instructions Dext needs. Explain the outcome you want and any constraints it should work within.</p><ul className="context-points"><li><strong>Bring your files and links.</strong><span>Select spreadsheets, CSVs, or text and Markdown notes with Files. Add website links and explain what you need in the chat.</span></li><li><strong>Choose what Dext can read.</strong><span>Selecting a file doesn’t share its contents. Ask Dext to read it, then approve access before the model receives the content.</span></li><li><strong>Keep adding the details.</strong><span>Send follow-ups to clarify priorities or change direction. The activity’s Context panel keeps file and link references together for you.</span></li></ul><a className="text-link" href={`${repository}/blob/main/README.md#work-documents-and-chat-context`}>How to give Dext context <Arrow /></a></div>
        <div className="context-example" aria-label="Illustrative example of adding context in Dextana by Fused"><div className="context-example-heading"><strong>A moving plan, with your context.</strong><span className="example-tag">Example</span></div><div className="context-message">Use my moving notes and budget to draft a checklist. Keep it within £2,000 and flag anything I still need to decide.</div><div className="context-file"><span aria-hidden="true">▤</span><div><strong>moving-notes.md</strong><small>Selected · awaiting read approval</small></div></div><div className="context-file"><span aria-hidden="true">▦</span><div><strong>budget.xlsx</strong><small>Selected · awaiting read approval</small></div></div><div className="context-followup"><span className="eyebrow">ONE MORE THING…</span><p>“I’m working until Friday. Put anything that needs a full day on the weekend.”</p></div><p className="context-example-note">Files and follow-up instructions stay with the activity.</p></div>
      </section>
      <section className="control-section" aria-labelledby="control-title"><div className="wrap control-grid"><div><p className="eyebrow">PRIVACY AND PERMISSIONS</p><h2 id="control-title">Choose your model.<br /><em>Control your data.</em></h2><p>With an open-weight model running locally, your prompts and approved files are processed on your computer, without sending them to a cloud model provider. You choose which files and services Dext can access.</p><a href={`${repository}/blob/main/README.md#data-and-boundaries`} className="text-link">Explore how Dextana works <Arrow /></a></div><div className="control-points"><article><span>01</span><div><h3>Choose the model that does the work.</h3><p>Select a model in Settings, or change it for an activity. Run an open-weight model on your computer to keep model processing local.</p></div></article><article><span>02</span><div><h3>Review the plan. Approve the action.</h3><p>Use Plan mode to agree on the steps first. Control access to browser actions, files, and connected tools.</p></div></article><article><span>03</span><div><h3>Keep your work close.</h3><p>Your chats and plans save on your computer. If you choose a cloud model or connect an external service, the information needed for that work leaves your device.</p></div></article></div></div></section>
      <section className="section wrap integrations-section" id="integrations" aria-labelledby="integrations-title"><div className="section-heading"><div><p className="eyebrow">SERVICE INTEGRATIONS</p><h2 id="integrations-title">If it has an OpenAPI,<br />bring it into the workflow.</h2></div><p>Connect services you use through <FusedLink />.<br />Choose the operations Dext can access<br />and approve the actions it takes.</p></div><div className="integration-grid"><div className="integration-flow" aria-label="An OpenAPI service connects through Fused to Dext"><div><span className="flow-kicker">YOUR SERVICE</span><strong>OpenAPI</strong><span>Public or internal API</span></div><span className="flow-arrow" aria-hidden="true">→</span><div><span className="flow-kicker">THE CONNECTION</span><strong><FusedLink /></strong><span>Configured operations</span></div><span className="flow-arrow" aria-hidden="true">→</span><div><span className="flow-kicker">YOUR ASSISTANT</span><strong>Dext</strong><span>Approved actions</span></div></div><div className="integration-copy"><h3>Use the browser and integrations in one task.</h3><p>Dext can navigate, read, and fill pages in its in-app browser, then use enabled integrations to work with your connected services. For example, gather supplier details from a website and prepare a contact in your CRM for approval.</p><p>Use <FusedLink /> to import a service’s OpenAPI definition, configure authentication, and choose its operations. Connect the resulting <FusedLink /> MCP endpoint in Dextana, and Dext can discover and use those tools with your permission.</p><p>Use existing integrations for a quick start, or connect your own service. Provider credentials stay in <FusedLink />; you control which operations Dext can access.</p><a className="text-link" href={`${repository}/blob/main/README.md#optional-fused-connection`}>Read the integration setup guide <Arrow /></a></div></div></section>
      <section className="section wrap getting-started" id="how-it-works" aria-labelledby="setup-title"><div className="section-heading"><div><p className="eyebrow">GETTING STARTED</p><h2 id="setup-title">Set up Dextana.</h2></div><p>Get started with <BrandName />.<br />Connect a model and try a task<br />you need help with.</p></div><ol className="steps"><li><span className="step-number">1</span><h3>Install Dextana.</h3><p>Get the alpha build for your computer. The installer includes the agent runtime.</p><a href="#download">Find your download <span aria-hidden="true">↓</span></a></li><li><span className="step-number">2</span><h3>Set up your model.</h3><p>For the current alpha, install Ollama and download a model with tool support. Connect it in Dextana’s Settings. Local models don’t require an OpenAI account or API key.</p><a href={`${repository}/blob/main/README.md#run-from-source`}>Model setup guide <Arrow /></a></li><li><span className="step-number">3</span><h3>Give Dext an assignment.</h3><p>Start an activity with a clear outcome. Add your files, links, and priorities, then review the plan and follow along.</p><a href="#possibilities">Try an example <span aria-hidden="true">↑</span></a></li></ol></section>
      <section className="download-section wrap" id="download" aria-labelledby="download-title"><div className="download-intro"><img src={dextLogo} alt="" width="64" height="64" /><p className="eyebrow"><BrandName /></p><h2 id="download-title">Try Dextana<br />with a real task.</h2><p>Bring Dext to your desktop.<br />Choose your platform to download the installer package.</p><span className="download-badge"><span className="live-dot" /> DESKTOP ALPHA</span></div><div className="download-options"><PlatformDownload /><p className="download-help">These links download the installer packages directly.</p><p className="download-help">The <a href="/license.txt">Dextana No-Resale License</a> permits personal and business use. Reselling the app or its installer packages requires written permission from <FusedLink />.</p><p className="download-help">Alpha builds are unsigned and unnotarized. <a href={downloads.guide}>Read the installation notes <Arrow /></a></p></div></section>
      <section className="section wrap faq-section" aria-labelledby="faq-title"><div><p className="eyebrow">A FEW THINGS TO KNOW</p><h2 id="faq-title">Common<br />questions.</h2></div><div className="faq-list">{questions.map(item => <details key={item.question}><summary>{item.question}<span aria-hidden="true">+</span></summary><p><LinkedFusedText text={item.answer} /></p></details>)}</div></section>
    </main>
    <footer className="site-footer wrap"><div><BrandLockup /><p>A desktop assistant for getting work done.</p><p className="ownership">Dextana is owned by <FusedLink />.</p></div><div className="footer-links"><a href={repository}>Private GitHub repository <Arrow /></a><a href={`${repository}/blob/main/README.md`}>Documentation <Arrow /></a><a href="/license.txt">License & usage <Arrow /></a></div><span className="footer-note">Work done. On your terms.</span></footer>
  </>;
}
