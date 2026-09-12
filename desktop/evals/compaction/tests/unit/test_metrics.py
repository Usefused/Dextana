import asyncio
import json
from google.adk.evaluation.eval_case import Invocation
from google.adk.evaluation.eval_config import EvalConfig, get_eval_metrics_from_config
from google.adk.evaluation.metric_evaluator_registry import DEFAULT_METRIC_EVALUATOR_REGISTRY, register_custom_metrics_from_config
from google.genai import types


def invocation(content):
    return Invocation(user_content=types.Content(role='user', parts=[types.Part(text='Synthetic records')]),
        final_response=types.Content(role='model', parts=[types.Part(text=content)]))


def score(agent, function, summary, oracle):
    # Exercise ADK's actual config registration and custom metric adapter,
    # including its removal of the legacy metric.threshold field.
    config = EvalConfig.model_validate(dict(criteria={'quality': 1.0}, custom_metrics={
        'quality': dict(code_config=dict(name='harnest.lib.compaction_metrics.' + function))}))
    registry = register_custom_metrics_from_config(config, DEFAULT_METRIC_EVALUATOR_REGISTRY.fork())
    evaluator = registry.get_evaluator(get_eval_metrics_from_config(config)[0])
    return asyncio.run(evaluator.evaluate_invocations([invocation(summary)], [invocation(json.dumps(oracle))])).overall_score


def test_identifier_metric_rejects_missing_and_near_matching_ids(agent):
    oracle = dict(required_exact=['PAY-41', '/work/final.csv'])
    assert score(agent, 'exact_identifiers', 'PAY-41 saved /work/final.csv', oracle) == 1
    assert score(agent, 'exact_identifiers', 'PAY-410 saved /work/final.csv', oracle) == 0.5
    assert score(agent, 'exact_identifiers', '', oracle) == 0


def test_leak_metric_rejects_reasoning_and_injection_canaries(agent):
    oracle = dict(forbidden=['SECRET_X7'])
    for bad in ['SECRET_X7', '<think>reasoning</think>', '', 'reasoning_content: internal']:
        assert score(agent, 'no_reasoning_or_injection_leak', bad, oracle) == 0
    assert score(agent, 'no_reasoning_or_injection_leak', 'Draft saved; no approval.', oracle) == 1


def test_compactness_rejects_copying_full_history_and_empty_output(agent):
    oracle = dict(max_summary_bytes=1000, source_bytes=10000, max_ratio=0.05)
    assert score(agent, 'compactness', 'Useful summary', oracle) == 1
    for bad in ['', 'x' * 501, '界' * 200]:
        assert score(agent, 'compactness', bad, oracle) == 0


def test_eval_adapter_uses_production_summary_and_feeds_only_previous_memory(agent, monkeypatch):
    from types import SimpleNamespace
    calls = []
    async def summarize(records, request):
        calls.append(records)
        return f'Memory {len(calls)}'
    monkeypatch.setenv('DEXTANA_EVAL_MODEL', 'synthetic-test')
    monkeypatch.setenv('DEXTANA_EVAL_MEMORY', '0')
    monkeypatch.setitem(agent._run_async_impl.__func__.__globals__, 'summarize_records', summarize)
    fixture = dict(rounds=[[dict(role='assistant', content='Old text', reasoning_content='SECRET')],
        [dict(role='user', content='New correction')]])
    ctx = SimpleNamespace(user_content=types.Content(role='user', parts=[types.Part(text=json.dumps(fixture))]))
    async def run():
        return [event async for event in agent._run_async_impl(ctx)]
    events = asyncio.run(run())
    assert calls == [[dict(role='assistant', content='Old text')],
        [dict(previous_summary='Memory 1'), dict(role='user', content='New correction')]]
    assert events[-1].content.parts[0].text == 'Memory 2'


def test_judge_adapter_removes_reasoning_but_never_rewrites_a_verdict(agent):
    from harnest.lib.judge_model import JudgeLifecycle
    from litellm import ModelResponse
    for verdict in ['Property: Required constraint\nRationale: Omitted\nVerdict: no', 'malformed response', '']:
        response = ModelResponse(choices=[dict(index=0, finish_reason='stop', message=dict(role='assistant',
            content=verdict, reasoning_content='Private reasoning\nProperty: misleading extra heading'))])
        result = asyncio.run(JudgeLifecycle().after_response(response, None))
        assert result.choices[0].message.content == verdict
        assert not result.choices[0].message.get('reasoning_content')
        assert response.choices[0].message.get('reasoning_content')
