import asyncio
import inspect


def test_desktop_observation_returns_typed_media_through_managed_tool(agent, monkeypatch):
    from harnest.content import Image
    from harnest.models.desktop_result import DesktopResult
    managed = next(tool for tool in agent.tools if getattr(tool, '__name__', '') == 'desktop')
    desktop = inspect.unwrap(managed)
    phases = []
    png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+afo0AAAAASUVORK5CYII='

    async def bridge(**request):
        phases.append(request['phase'])
        if request['phase'] == 'prepare':
            return {'requiresApproval': False, 'ticket': 'issued-by-desktop'}
        return {'snapshotId': 's00000001', 'elements': [], 'image': {'type': 'image', 'mediaType': 'image/png', 'data': png}}

    monkeypatch.setitem(desktop.__globals__, '_desktop_bridge', bridge)
    result = asyncio.run(desktop(action='call', work='computer', operation='computer.observe'))
    assert phases == ['prepare', 'execute']
    assert isinstance(result, DesktopResult)
    assert isinstance(result.image, Image)
    assert result.image.media_type == 'image/png'
    assert result.model_extra['snapshotId'] == 's00000001'


def test_desktop_prepare_failure_never_executes_native_input(agent, monkeypatch):
    managed = next(tool for tool in agent.tools if getattr(tool, '__name__', '') == 'desktop')
    desktop = inspect.unwrap(managed)
    phases = []

    async def bridge(**request):
        phases.append(request['phase'])
        return {'error': 'Select a window for this chat.'}

    monkeypatch.setitem(desktop.__globals__, '_desktop_bridge', bridge)
    result = asyncio.run(desktop(action='call', work='computer', operation='computer.act'))
    assert phases == ['prepare']
    assert result.model_extra['error'] == 'Select a window for this chat.'
