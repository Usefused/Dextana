from harnest.agent import Agent
from harnest.lib.ollama import desktop_model


root_agent = Agent(
    name="dextana",
    history="session",
    model=desktop_model(),
)
