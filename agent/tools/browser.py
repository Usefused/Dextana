from typing import Literal
from harnest.tool import client_tool


@client_tool
def browser(action: Literal["open", "read", "click", "fill", "clear_cookies"], url: str = "", ref: str = "", text: str = "") -> dict:
    """Operate this activity's isolated browser. Open an HTTP(S) URL first.

    action: Open a page, read its visible content, click a referenced element,
        fill a referenced input, or clear_cookies to remove all cookies (including
        HttpOnly cookies) from this activity's isolated browser session. Only click/fill elements seen in the latest read.
    clear_cookies leaves local storage and other activities untouched. It can sign
    this activity out of sites. Use it when requested or needed for an authorized
    login/session reset. It does not reload the page; open the desired URL afterward
    if a fresh page is needed. Never repeat a submitted form just to refresh it.

    url: Page address for open; leave empty for other actions.
    ref: Numeric element reference from the most recent browser result.
    text: Value to place in an input for fill; leave empty otherwise.
    """
    ...
