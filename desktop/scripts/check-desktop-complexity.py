#!/usr/bin/env python3
"""Enforce the desktop Python function complexity budget without dependencies.

Count explicit control-flow decisions (including short circuits, comprehensions,
exception handlers and non-default match cases). Nested functions are measured
separately, so extracting a responsibility cannot conceal a complex callback.
"""

import argparse
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FILES = (
    'agent/lib/scheduler.py',
    'agent/lib/desktop_bridge.py',
    'agent/tools/desktop.py',
)
FUNCTIONS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)


class Decisions(ast.NodeVisitor):
    def __init__(self):
        self.count = 1

    def visit_FunctionDef(self, node):
        # Each nested callable has its own result from ast.walk().
        pass

    visit_AsyncFunctionDef = visit_FunctionDef
    visit_Lambda = visit_FunctionDef
    visit_ClassDef = visit_FunctionDef

    def visit_If(self, node):
        self.count += 1
        self.generic_visit(node)

    visit_IfExp = visit_If
    visit_For = visit_If
    visit_AsyncFor = visit_If
    visit_While = visit_If
    visit_ExceptHandler = visit_If
    visit_Assert = visit_If

    def visit_BoolOp(self, node):
        self.count += len(node.values) - 1
        self.generic_visit(node)

    def visit_comprehension(self, node):
        self.count += 1 + len(node.ifs)
        self.generic_visit(node)

    def visit_match_case(self, node):
        wildcard = isinstance(node.pattern, ast.MatchAs) and node.pattern.pattern is None
        if not wildcard or node.guard is not None:
            self.count += 1
        self.generic_visit(node)


def function_complexity(node):
    visitor = Decisions()
    if isinstance(node, ast.Lambda):
        visitor.visit(node.body)
    else:
        for statement in node.body:
            visitor.visit(statement)
    return visitor.count


def inspect_file(path, limit):
    tree = ast.parse(path.read_text(encoding='utf-8'), filename=str(path))
    results = [(node, function_complexity(node)) for node in ast.walk(tree) if isinstance(node, FUNCTIONS)]
    maximum = max((count for _, count in results), default=0)
    print(f'{path.relative_to(ROOT)}: {len(results)} functions; maximum {maximum}')
    failures = [(node, count) for node, count in results if count > limit]
    for node, count in failures:
        name = getattr(node, 'name', '<lambda>')
        print(f'  {path.relative_to(ROOT)}:{node.lineno} {name}: {count} exceeds {limit}')
    return len(failures)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='*', default=DEFAULT_FILES)
    parser.add_argument('--limit', type=int, default=10)
    arguments = parser.parse_args()
    failures = sum(inspect_file(ROOT / name, arguments.limit) for name in arguments.files)
    raise SystemExit(1 if failures else 0)


if __name__ == '__main__':
    main()
