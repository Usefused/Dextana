from typing import Literal
from harnest.tool import client_tool


@client_tool
def browser(action: Literal["open", "read", "click", "fill", "clear_cookies", "new_tab", "list_tabs", "close_tab"], url: str = "", ref: str = "", text: str = "", tab_id: str = "") -> dict:
    """Operate this activity's isolated browser. Open an HTTP(S) URL first.

    action: Open a page, read its visible content, click a referenced element,
        fill a referenced input, or clear_cookies to remove all cookies (including
        HttpOnly cookies) from this activity's isolated browser session. Only click/fill elements seen in the latest read.
    clear_cookies leaves local storage and other activities untouched. It can sign
    this activity out of sites. Use it when requested or needed for an authorized
    login/session reset. It does not reload the page; open the desired URL afterward
    if a fresh page is needed. Never repeat a submitted form just to refresh it.

    new_tab opens an additional page without replacing existing tabs. list_tabs
    returns only your activity's tabs. close_tab closes the specified owned tab.
    Tabs in this activity share browser storage. Other workers have isolated storage.
    Every page result includes tab_id. Use that ID explicitly when working across
    pages; element references belong only to the tab where they were observed.
    The owner's visible tab selection does not change the agent's target.

    url: Page address for open or new_tab; leave empty for other actions.
    tab_id: Owned tab ID to read, navigate, click, fill, or close. Empty uses the
        last tab operated by this agent. Never use another worker's tab ID.
    ref: Numeric element reference from the most recent browser result.
    text: Value to place in an input for fill; leave empty otherwise.
    """
    ...
