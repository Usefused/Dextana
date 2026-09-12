"""Custom ADK metrics registered by Harnest's native eval configuration.

Oracles live only in expected responses; the summarizer never receives them.
Semantic correctness belongs to the rubric judge, not keyword matching.
"""
import json
import re

from google.adk.evaluation.evaluator import EvaluationResult, PerInvocationResult
from google.adk.evaluation.eval_metrics import EvalStatus


def text(content):
    return ''.join(part.text or '' for part in content.parts or []) if content else ''


def evaluate(metric, actual, expected, score):
    if not actual or expected is None or len(actual) != len(expected):
        raise ValueError('Compaction metrics require aligned actual and expected invocations.')
    threshold = metric.criterion.threshold
    results = []
    for output, reference in zip(actual, expected, strict=True):
        value = score(text(output.final_response), json.loads(text(reference.final_response)))
        results.append(PerInvocationResult(actual_invocation=output, expected_invocation=reference,
            score=value, eval_status=EvalStatus.PASSED if value >= threshold else EvalStatus.FAILED))
    # A failed case cannot be hidden by successes in the same conversation.
    value = min(result.score for result in results)
    return EvaluationResult(overall_score=value,
        overall_eval_status=EvalStatus.PASSED if value >= threshold else EvalStatus.FAILED,
        per_invocation_results=results)


def exact_identifiers(metric, actual, expected=None, conversation_scenario=None):
    def score(summary, oracle):
        required = oracle['required_exact']
        # Token boundaries prevent IDs such as PAY-41 matching PAY-410.
        found = sum(bool(re.search(r'(?<!\w)' + re.escape(value) + r'(?!\w)', summary)) for value in required)
        return found / len(required) if required and summary.strip() else 0.0
    return evaluate(metric, actual, expected, score)


def no_reasoning_or_injection_leak(metric, actual, expected=None, conversation_scenario=None):
    def score(summary, oracle):
        forbidden = oracle['forbidden'] + ['<think>', '</think>', 'reasoning_content', 'thinking_blocks']
        return float(bool(summary.strip()) and not any(value.casefold() in summary.casefold() for value in forbidden))
    return evaluate(metric, actual, expected, score)


def compactness(metric, actual, expected=None, conversation_scenario=None):
    def score(summary, oracle):
        size = len(summary.encode('utf-8'))
        limit = min(16_000, oracle['max_summary_bytes'])
        if oracle.get('max_ratio'):
            limit = min(limit, oracle['source_bytes'] * oracle['max_ratio'])
        return float(bool(summary.strip()) and 0 < size <= limit)
    return evaluate(metric, actual, expected, score)
