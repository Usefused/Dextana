"""Regression checks for the dependency-free Python complexity gate."""
import ast
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    'desktop_complexity', Path(__file__).with_name('check-desktop-complexity.py'))
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class ComplexityTests(unittest.TestCase):
    def test_nested_functions_have_independent_decisions(self):
        tree = ast.parse('''
def outer(items):
    def inner(value):
        return value or fallback
    return [inner(item) for item in items if item and item.ready]
''')
        outer = tree.body[0]
        self.assertEqual(checker.function_complexity(outer), 4)
        self.assertEqual(checker.function_complexity(outer.body[0]), 2)

    def test_branch_loop_and_exception_paths(self):
        tree = ast.parse('''
async def run(items):
    try:
        for item in items:
            if item:
                await consume(item)
    except ValueError:
        return one if condition else two
''')
        self.assertEqual(checker.function_complexity(tree.body[0]), 5)


if __name__ == '__main__':
    unittest.main()
