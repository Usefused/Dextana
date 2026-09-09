from typing import Literal
from harnest.agent import client_tool
from harnest.models.browser_result import BrowserResult


@client_tool
def browser(action: Literal["connect_user", "open", "read", "click", "fill", "clear_cookies", "new_tab", "list_tabs", "downloads", "close_tab", "press", "click_outside", "hover", "scroll", "screenshot"], url: str = "", ref: str = "", text: str = "", tab_id: str = "", key: str = "", offset: int = 0, limit: int = 100, text_offset: int = 0, x: float = -1, y: float = -1, delta_x: float = 0, delta_y: float = 0, click_count: int = 1) -> BrowserResult:
    """Operate this chat's browser. Load browser-work before first use; reuse it afterward.

    For the owner's Chrome/Edge, use connect_user if disconnected. Never substitute
    another browser. list_tabs returns scope/coverage; reuse an already-open tab by
    its observed tab_id without reopening it. A missing tab may be outside the grant.
    Use current observed refs/URLs only. Input actions return a fresh page and refs:
    inspect that result to verify the effect and choose the next action, without an
    extra read unless needed. Never replay an uncertain submission.

    action: Browser operation; browser-work describes supported actions by mode,
        permissions, forms, keys, overlays, sign-in and downloads.
    url: Address for open/new_tab. new_tab preserves existing pages.
    tab_id: Observed tab ID; empty uses this agent's last operated tab. Refs are tab-local.
    ref: Latest element reference for click/fill/hover or focused read; optional for
        press to preserve focus. click_outside requires an observed overlay ref.
    text: Value for fill. Fill does not submit; use Enter or the form's submit control.
    key: Key for press. Attached: Enter, Escape, Tab, Space, Backspace, Delete,
        ArrowUp/Down/Left/Right, Home, End. In-app also: Return, Esc, Shift+Tab,
        PageUp/Down, SelectAll, Copy, Paste (private activity clipboard).
    offset/limit: Read element pagination, limit 1..1000, default 100. Follow
        next_offset only when needed; act on relevant controls already observed.
    text_offset: Text pagination; follow next_text_offset for more relevant content.
    x/y: Observed viewport CSS coordinates for scroll, or in-app click/hover.
    delta_x/delta_y: Scroll wheel movement; negative delta_y scrolls down.
    click_count: In-app click count, 1 or 2. Attached supports ref-based single clicks.
    screenshot: Viewport image via the configured interpreter or chat model.
    downloads: In-app download receipts; claim saved only for completed with a path.
    clear_cookies: In-app cookie reset including HttpOnly; may sign this activity out.
    """
    ...
