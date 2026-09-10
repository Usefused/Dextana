export const repository = 'https://github.com/Usefused/Dextana';
export const downloads = {
  guide: '/guide#installation',
  // Stable public release assets, refreshed only after every platform passes CI.
  platforms: {
    macos: {
      name: 'macOS', architecture: 'Apple silicon (ARM64)',
      format: 'DMG', instructions: 'Open the DMG and drag Dextana into Applications.',
      url: `${repository}/releases/download/desktop-alpha/Dextana-mac-arm64.dmg`,
    },
    windows: {
      name: 'Windows', architecture: '64-bit (x64)',
      format: 'EXE', instructions: 'Run the installer and follow the setup steps.',
      url: `${repository}/releases/download/desktop-alpha/Dextana-win-x64.exe`,
    },
    linux: {
      name: 'Linux', architecture: '64-bit (x64)',
      format: 'AppImage', instructions: 'Allow the AppImage to run as a program, then open it.',
      url: `${repository}/releases/download/desktop-alpha/Dextana-linux-x86_64.AppImage`,
    },
  },
};

export const examples = [
  { number: '01', icon: '◎', title: 'From research to action.', description: 'Work through websites and connected apps in one task: gather details, fill forms, and update a service with the permissions you choose.', prompt: 'Read this supplier’s contact page and prepare a contact in my connected CRM. Show me the details before saving.', kind: 'Browser & integrations' },
  { number: '02', icon: '▤', title: 'Turn files into finished work.', description: 'Pull details from PDFs, Word documents, spreadsheets, and notes. Create a budget workbook, CSV, checklist, or written summary you can use.', prompt: 'Read my expenses CSV and the invoices I attached. Group the spending by category and create a budget workbook with a summary of anything that needs checking.', kind: 'Documents & tables' },
  { number: '03', icon: '⑂', title: 'Move several parts forward.', description: 'Let Dext work on different parts of a task at the same time, then bring the findings together for you.', prompt: 'Help me plan my move. Work on a moving checklist and a budget at the same time. Bring both together into a plan.', kind: 'Parallel work' },
];

export const questions = [
  { question: 'Who is Dextana for?', answer: 'Anyone with things to get done: planning a move, comparing a purchase, organising freelance work, or getting through business admin. Dextana by Fused brings your browser, files, and connected apps into one place so you can focus on the result.' },
  { question: 'Do I need to be technical?', answer: 'You give Dext tasks in ordinary language. There is some initial setup: install the app and connect an AI provider or a local model. Our getting-started guide explains the options. Connecting extra services is optional and may need additional setup.' },
  { question: 'What can I give Dext to work with?', answer: 'Bring your instructions, links, PDFs, Word documents, spreadsheets, notes, and images. Ask Dext to find the useful details, compare information, or put together a workbook, checklist, or summary. The guide covers supported files and sizes.' },
  { question: 'Can Dext use websites for me?', answer: 'Yes. Dext can browse websites, move between tabs, fill forms, and work through on-screen steps. Sign in to the sites you need inside its browser. Some login checks or website restrictions may still need your help.' },
  { question: 'Can I choose the AI I use?', answer: 'Yes. Connect a cloud provider or run a model on your own computer, and switch models as your needs change. A cloud provider may require an account, an API key, and separate payment. The setup guide explains what you need.' },
  { question: 'What happens to my data?', answer: 'Your chats, plans, and schedules are saved on your computer. A local model can process work there too. If you choose a cloud model, task context is sent to that provider. Websites and connected apps receive the information needed to carry out their actions. You control what Dext can access.' },
  { question: 'Can Dext connect to the apps I use?', answer: 'Fused connects Dext to other services so it can do things there, as well as browse websites. What is available depends on the services you connect and the actions you enable. You can start with browser and file tasks, then add connections when you need them.' },
  { question: 'Can it remind me or run work later?', answer: 'Yes. Ask for a reminder, schedule a task, or set up recurring work. Keep Dextana open and your computer awake for these to run. Missed runs are skipped, and scheduled work still follows your permissions.' },
  { question: 'How much control do I have?', answer: 'Review the steps in Plan mode before work begins, or get started in Work mode. Approve actions as they come up or allow access for the chat. You decide which files, websites, and connected tools Dext can use.' },
  { question: 'Is there anything I should know before starting?', answer: 'Dextana is currently an alpha, so expect some rough edges. It can read PDFs and Word documents, but creates workbooks, CSVs, and text documents. It does not control other desktop apps or upload and download files through its browser. Check important results, and see the guide for the full details.' },
];
