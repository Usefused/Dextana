export const repository = 'https://github.com/Usefused/Dextana';
export const downloads = {
  guide: `${repository}/blob/main/docs/packaging.md`,
  // Installer packages from successful packaging run 34288516486.
  // Source: 0440ad31e98c6c443cae7a7bf73c1206eca7170c. Refresh before expiry.
  platforms: {
    macos: {
      name: 'macOS', version: '0.1.0', architecture: 'Apple silicon (ARM64)',
      format: 'ZIP · 483 MB', instructions: 'Unzip the package and open the included DMG installer.',
      url: `${repository}/actions/runs/34288516486/artifacts/10080613868`,
      expiresAt: '2026-09-22T23:05:43Z',
    },
    windows: {
      name: 'Windows', version: '0.1.0', architecture: '64-bit (x64)',
      format: 'ZIP · 448 MB', instructions: 'Unzip the package and run the included EXE installer.',
      url: `${repository}/actions/runs/34288516486/artifacts/10080783730`,
      expiresAt: '2026-09-22T23:11:40Z',
    },
    linux: {
      name: 'Linux', version: '0.1.0', architecture: '64-bit (x64)',
      format: 'ZIP · 267 MB', instructions: 'Unzip the package, make the included AppImage executable, and open it.',
      url: `${repository}/actions/runs/34288516486/artifacts/10080532414`,
      expiresAt: '2026-09-22T23:03:00Z',
    },
  },
};

export const examples = [
  { number: '01', icon: '◎', title: 'From a page to your tools.', description: 'Read details in the in-app browser, then use an enabled integration to add them to a connected service.', prompt: 'Read this supplier’s contact page and prepare a contact in my connected CRM. Show me the details before saving.', kind: 'Browser & integrations' },
  { number: '02', icon: '▤', title: 'Prepare a budget workbook.', description: 'Read spreadsheets and notes, then create a clear table, budget workbook, or Markdown document.', prompt: 'Read my expenses CSV, group the spending by category, and create a budget workbook I can review.', kind: 'Documents & tables' },
  { number: '03', icon: '⑂', title: 'Split up a project.', description: 'Delegate independent pieces of a task to workers with their own browser sessions and enabled tools, then bring the results together.', prompt: 'Help me plan my move. Use one worker for a moving checklist and another for the costs I should budget for. Bring both together into a plan.', kind: 'Parallel work' },
];

export const questions = [
  { question: 'Can I give the agents my own context?', answer: 'Yes. Add instructions and links in the chat, and use Files to select Excel workbooks, CSVs, or text and Markdown documents. Dext asks before reading a file; selecting one alone does not share its contents. Add follow-up messages to clarify the work. File and link references stay in the activity’s Context panel. Delegated workers have their own permissions unless you approve a plan that explicitly covers the resources they need.' },
  { question: 'What is the difference between Dext and Dextana?', answer: 'Dextana by Fused is the desktop app. Dext is the assistant you work with inside it: give it an assignment, review its actions, and follow the results in your activity.' },
  { question: 'Do I need an OpenAI account or API key?', answer: 'No. For local use, the current alpha connects to Ollama, which runs a downloaded model on your computer. You still need to install Ollama and choose a model with tool support, but you do not need an OpenAI account or API key. The Dextana installer includes its agent runtime.' },
  { question: 'Can I choose which model Dext uses?', answer: 'Yes. Select your default model in Settings, or choose a different model for an activity or follow-up message. Use a model with tool support for browser work and integrations. Local models run on your hardware; choosing a cloud model sends the content it needs to its provider.' },
  { question: 'Does everything stay on my computer?', answer: 'Chats, plans, and checkpoints are stored locally. Inference runs wherever your configured model runs. If you choose a cloud model, approved content is sent to its provider. Browsing and connected services also make network requests.' },
  { question: 'Can Dext connect to the apps I use?', answer: 'Yes. Dext can combine work in its in-app browser with actions in connected services. Fused provides quick integrations and a path to connect services that have an OpenAPI definition. Import and configure the service in Fused, including authentication and the operations you want to expose, then connect its MCP endpoint in Dextana. Dext can discover and use those operations with your permission. You can also connect other Streamable HTTP or local stdio MCP servers.' },
  { question: 'Who is Dextana for?', answer: 'Dextana by Fused is for people who want practical work done and a say in which model does it. You might be preparing a budget, researching a purchase, or organising a project. You choose the model, provide the context, and review the work. Local setup takes a few steps, but does not require an OpenAI API key.' },
  { question: 'What should I know about the alpha?', answer: 'The installers are currently unsigned and unnotarized, and automatic updates are not configured. Browser work supports navigation, reading, filling, and clicking on top-level pages. File uploads, browser downloads, and operating-system control are not supported yet. Review important results before using them.' },
];
