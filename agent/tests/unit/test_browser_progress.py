import pytest


def page(ref='a', text='Mail body and invoice attachment', label='Invoice.pdf'):
    return dict(tab_id='tab-a', url='https://mail.example/message', text=text,
                elements=[dict(ref=ref, tag='button', label=label, bounds=dict(x=20, y=30))])


def test_repeated_refs_and_overlapping_reads_warn_then_stop(agent):
    from harnest.lib.browser_progress import BrowserProgress, BrowserStalled
    guard = BrowserProgress()
    guard.observe('browser', dict(action='read'), page())
    for i in range(1, 7):
        result = guard.observe('browser', dict(action='scroll' if i % 2 else 'read'), page(str(i), 'invoice attachment'))
    assert 'recovery' in result
    with pytest.raises(BrowserStalled):
        guard.observe('browser', dict(action='read'), page('new-ref', 'invoice attachment'))


def test_actual_progress_and_other_tabs_do_not_trip_guard(agent):
    from harnest.lib.browser_progress import BrowserProgress
    guard = BrowserProgress()
    for i in range(25):
        result = guard.observe('browser', dict(action='read'), page(str(i), f'New invoice line {i}', f'Attachment {i}'))
        assert 'recovery' not in result
    for i in range(3):
        guard.observe('browser', dict(action='read'), page())
    assert 'recovery' not in guard.observe('browser', dict(action='read'), dict(page(), tab_id='tab-b'))


def test_identical_errors_stop_after_four_attempts_even_across_actions(agent):
    from harnest.lib.browser_progress import BrowserProgress, BrowserStalled
    guard = BrowserProgress()
    for action in ['read', 'read', 'screenshot']:
        result = guard.observe('browser', dict(action=action), dict(error='Disconnected'))
    assert 'recovery' in result
    with pytest.raises(BrowserStalled):
        guard.observe('browser', dict(action='read'), dict(error='Disconnected'))
    assert guard.observe('files', {}, dict(error='Disconnected')) == dict(error='Disconnected')
