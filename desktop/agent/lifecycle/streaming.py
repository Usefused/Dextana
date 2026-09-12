from harnest import lifecycle


@lifecycle.adk_plugin
def streaming():
    """Request incremental model events from the managed ADK runner."""
    from google.adk.agents.run_config import StreamingMode
    from google.adk.plugins.base_plugin import BasePlugin

    class DesktopStreaming(BasePlugin):
        async def before_run_callback(self, *, invocation_context):
            invocation_context.run_config.streaming_mode = StreamingMode.SSE
            return None

    return DesktopStreaming(name="desktop_streaming")
