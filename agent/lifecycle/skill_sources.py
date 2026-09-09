from harnest import context, lifecycle
from harnest.skills import SkillNotFoundError


@lifecycle.tool.before
async def validate_skill_source(call_context, request):
    """Keep failed skill lookups recoverable through Harnest's scoped public API."""
    if request.name not in ('list_skills', 'load_skill', 'load_skill_resource'):
        return call_context.next(request)
    source = request.kwargs.get('source')
    try:
        if request.name != 'list_skills':
            return call_context.finish(await load_instructions(request))
        if source:
            await context.skills.list(source=source, limit=1)
    except SkillNotFoundError:
        return call_context.finish(
            'Skill lookup unavailable. No skill was loaded. Call list_skills '
            'with source omitted or empty, then load the selected descriptor '
            'using its exact id, source, and version. Do not reuse failed identifiers.'
        )
    return call_context.next(request)


async def load_instructions(request):
    # The public API retains source scope, version pins and permission checks.
    arguments = request.kwargs
    options = dict(source=arguments.get('source') or None,
                   version=arguments.get('version') or None)
    if request.name == 'load_skill':
        document = await context.skills.load(arguments['name'], **options)
        return document.instructions
    resource = await context.skills.load_resource(arguments['name'], arguments['path'], **options)
    return resource.content
