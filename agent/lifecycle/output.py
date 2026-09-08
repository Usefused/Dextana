from harnest.lifecycle import lifecycle
from harnest.output import OutputPolicy


@lifecycle.output_policy
def output_policy():
    """Expose provider-supplied thinking separately from the final answer."""
    return OutputPolicy(thinking=True)
