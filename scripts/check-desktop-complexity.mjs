import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { pathToFileURL } from 'node:url';

const traverse = traverseModule.default;
const limit = 10;

/** Count independent decision paths, excluding nested functions from their parent.
 * Short circuits, defaults, and optional accesses count as branches too, as in ESLint.
 */
export function complexities(source, filename) {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const results = [];
  const scopes = [];
  const branch = () => {
    if (scopes.length) scopes.at(-1).complexity++;
  };
  traverse(ast, {
    Function: {
      enter(path) {
        const node = path.node;
        const name =
          node.id?.name ??
          node.key?.name ??
          path.parent.id?.name ??
          path.parent.key?.name ??
          '<callback>';
        scopes.push({ file: filename, line: node.loc.start.line, name, complexity: 1 });
      },
      exit() {
        results.push(scopes.pop());
      },
    },
    'IfStatement|ConditionalExpression|ForStatement|ForInStatement|ForOfStatement|WhileStatement|DoWhileStatement|CatchClause|LogicalExpression|AssignmentPattern':
      branch,
    SwitchCase(path) {
      if (path.node.test) branch();
    },
    AssignmentExpression(path) {
      if (['&&=', '||=', '??='].includes(path.node.operator)) branch();
    },
    'OptionalMemberExpression|OptionalCallExpression'(path) {
      if (path.node.optional) branch();
    },
  });
  return results;
}

function desktopFiles() {
  const directory = 'src/main/desktop';
  return [
    ...readdirSync(directory)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => `${directory}/${name}`),
    ...readdirSync('src/main/user-browser')
      .filter((name) => name.endsWith('.ts'))
      .map((name) => `src/main/user-browser/${name}`),
    ...['actions', 'page', 'popup', 'worker', 'tabs', 'session', 'screenshot'].map(
      (name) => `browser-extension/control-${name}.js`,
    ),
    'src/shared/user-browser.ts',
    'src/renderer/UserBrowser.tsx',
    'src/main/main.ts',
    'src/main/local-capabilities.ts',
    'src/renderer/ContextPanel.tsx',
    'src/renderer/ApprovalDetails.tsx',
    'src/renderer/ActionApproval.tsx',
    'src/main/context.ts',
    'src/shared/desktop.ts',
    'src/shared/desktop-presentation.ts',
    'src/shared/desktop-time-files.ts',
    'src/shared/desktop-workflows.ts',
    'scripts/test-computer-native-host.ts',
    'src/shared/desktop-computer.ts',
    'src/renderer/DesktopComputer.tsx',
    'src/renderer/DesktopWorkspace.tsx',
    'src/renderer/DesktopTimers.tsx',
    'src/renderer/DesktopWorkflowsPanel.tsx',
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.length > 2 ? process.argv.slice(2) : desktopFiles();
  const results = files.flatMap((file) => complexities(readFileSync(file, 'utf8'), file));
  const failures = results
    .filter((result) => result.complexity > limit)
    .sort((a, b) => b.complexity - a.complexity);
  for (const result of failures)
    console.error(
      `${result.file}:${result.line} ${result.name}: ${result.complexity} (maximum ${limit})`,
    );
  console.log(
    `Checked ${results.length} functions in ${files.length} files; ${failures.length} exceed ${limit}.`,
  );
  process.exitCode = failures.length ? 1 : 0;
}
