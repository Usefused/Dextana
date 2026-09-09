from harnest.skills import SkillSource, SkillDescriptor, SkillDocument, SkillPage, SkillNotFoundError
from harnest.lib.settings_store import skills


def descriptor(item):
    return SkillDescriptor(id=item['id'], name=item['name'], description=item['description'], version=item['version'])


class PersonalSkills(SkillSource):
    async def list(self, context, *, query=None, cursor=None, limit=50):
        if context.user_id != 'owner':
            return SkillPage(items=())
        items = [item for item in skills() if item['enabled'] and (not query or query.casefold() in (item['name'] + ' ' + item['description']).casefold())]
        try:
            offset = max(0, int(cursor or '0'))
        except ValueError:
            raise ValueError('Invalid skill cursor') from None
        limit = max(1, min(limit, 50))
        return SkillPage(items=tuple(descriptor(item) for item in items[offset:offset + limit]), next_cursor=str(offset + limit) if offset + limit < len(items) else None)

    async def load(self, skill_id, context, *, version=None):
        if context.user_id == 'owner':
            item = next((item for item in skills() if item['id'] == skill_id and item['enabled'] and (version is None or item['version'] == version)), None)
            if item:
                return SkillDocument(descriptor=descriptor(item), instructions=item['instructions'])
        raise SkillNotFoundError('This skill is disabled, changed, or unavailable. Refresh the skill list.')
