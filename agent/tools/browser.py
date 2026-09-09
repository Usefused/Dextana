from typing import Literal
from harnest.agent import client_tool
from harnest.models.browser_result import BrowserResult


@client_tool
def browser(action: Literal["open", "read", "click", "fill", "clear_cookies", "new_tab", "list_tabs", "close_tab", "press", "click_outside", "hover", "scroll", "screenshot"], url: str = "", ref: str = "", text: str = "", tab_id: str = "", key: str = "", offset: int = 0, limit: int = 250, text_offset: int = 0, x: float = -1, y: float = -1, delta_x: float = 0, delta_y: float = 0, click_count: int = 1) -> BrowserResult:
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
    press sends a trusted keyboard action. Set ref to focus a previously observed
    control first, or omit ref to keep the current focus. After fill, press Enter
    without ref to submit. Use Escape without ref to dismiss the active dialog or
    popup, Tab to move forward, and Shift+Tab to move back without resetting focus.
    Page results include focused_ref and overlays with references and labels.
    click_outside requires an overlay ref from the latest result. It clicks a
    visible non-interactive area outside that overlay, avoiding underlying buttons
    and links. If none exists, use Escape or a visible close button. It does not
    force a dialog closed; inspect the returned overlays and page to verify dismissal.
    Copy and Paste use a private in-memory clipboard for this activity, never the
    system clipboard. SelectAll selects the contents of an editable field. Copy
    requires selected text; password fields cannot be copied.
    key: For press only: Enter (or Return), Escape (or Esc), Space, Tab, Shift+Tab,
        Backspace, Delete, ArrowUp, ArrowDown,
        ArrowLeft, ArrowRight, Home, End, PageUp, PageDown, SelectAll, Copy, Paste.
        Leave empty for other actions. Arbitrary shortcuts are not supported.
    Reads expose ALL DOM elements, including ordinary text containers, images,
    canvases, offscreen and hidden elements, shadow roots, and embedded frames.
    offset/limit: Element pagination for read. Follow next_offset until null; no
        elements are discarded. limit is 1..1000, default 250.
    text_offset: Text pagination for read. Follow next_text_offset until null.
    read with ref inspects that element's full text and attributes, with text pagination.
    screenshot returns image media of the browser viewport; use a vision-capable model.
    click/hover can use ref OR x,y coordinates in main viewport CSS pixels, taken
        from observed bounds or a screenshot. Scale screenshot pixels by the returned
        viewport dimensions. Coordinate clicks support canvas and any visible surface.
    click_count: 1 for click, 2 for double-click. hover reveals hover-only controls.
    scroll: Send a mouse wheel at x,y to scroll the region under that point.
    delta_x/delta_y: Wheel movement in pixels; negative delta_y scrolls down.
    Frame element refs contain a prefix and route automatically to that frame.
    Hidden or covered elements remain inspectable but need to be revealed before
        a physical click can reach them. Do not infer missing content from one page.
    For mail, distinguish the matching message row from search inputs/chips and
    conversation-preview icons. Check sender, subject and date, then click the row
    to open its body. Enter in a search input only submits that search again. A script
    error alone does not mean the site blocks automation; follow the specific error.
    ref: Element reference from the most recent browser result; optional
        for press to preserve the current focus. For click_outside, use an overlay ref.
    text: Value to place in an input for fill; leave empty otherwise.
    """
    ...
