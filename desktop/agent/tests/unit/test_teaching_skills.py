import pytest


def evidence():
    return [
        dict(id='one', kind='app_change', at='now', application='Browser', window='Customers', label='Customer Acme'),
        dict(id='two', kind='click', at='later', application='CRM', window='Contacts', role='button', label='Add contact'),
        dict(id='three', kind='explanation', at='later', explanation='Use the selected customer and confirm the saved row.'),
    ]


def test_demonstration_becomes_versioned_skill_and_records_scoped_test(agent, monkeypatch, tmp_path):
    from harnest.lib.teaching_skills import draft_teaching
    from harnest.lib.settings_store import archive_taught_skill, record_taught_test, save_taught_skill, taught_skills
    monkeypatch.setenv('DEXTANA_STORAGE_DIRECTORY', str(tmp_path))
    draft = draft_teaching(dict(objective='Copy customer into CRM', evidence=evidence()))
    assert draft['applications'] == ['Browser', 'CRM']
    assert draft['steps'][0]['method'] == 'connector_or_browser'
    assert 'label and surrounding UI' in draft['steps'][1]['intent']
    saved = save_taught_skill(dict(draft, status='draft'))
    assert saved['versionNumber'] == 1
    assert saved['status'] == 'draft'
    saved['steps'][0]['intent'] = 'Read the selected customer in the browser.'
    updated = save_taught_skill(dict(saved, status='needs_attention'))
    assert updated['versionNumber'] == 2
    assert updated['version'] != saved['version']
    tested = record_taught_test(saved['id'], dict(activityId='activity-1', inputNames=['customer'], outcome='completed'))
    assert tested['status'] == 'tested_successfully'
    assert tested['tested']['inputs'] == ['customer']
    assert archive_taught_skill(saved['id'], True)['archived'] is True
    assert taught_skills()[0]['versionNumber'] == 2


def test_server_refuses_unredacted_sensitive_evidence(agent):
    from harnest.lib.teaching_skills import draft_teaching
    with pytest.raises(ValueError, match='not redacted'):
        draft_teaching(dict(objective='Sign in', evidence=[dict(
            id='one', kind='keyboard', at='now', role='password field', label='Password', value='do-not-upload'
        )]))


def test_keyboard_labels_become_inputs_without_retaining_values(agent):
    from harnest.lib.teaching_skills import draft_teaching, validate_draft
    draft = draft_teaching(dict(objective='Copy customer into CRM', evidence=[dict(
        id='one', kind='keyboard', at='now', application='CRM', role='text field',
        label='Customer name', value='Acme'
    )]))
    assert draft['inputs'] == [dict(
        id='customer-name', name='Customer name',
        description='Value to enter in Customer name.', required=True
    )]
    assert 'Acme' not in str(validate_draft(draft))
