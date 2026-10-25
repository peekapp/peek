"""Run against an isolated Peek database: uv run --with playwright python tests/ui_smoke.py URL.

Profile/screen checks use real writes. Extension UI uses deterministic API fixtures;
it does not require or test the Docker runner.
"""

import sys
import uuid
import re
from playwright.sync_api import sync_playwright, expect, Error

base = sys.argv[1].rstrip("/")
suffix = uuid.uuid4().hex[:8]


def visit(page, path):
    page.goto(base + path)
    page.wait_for_load_state("networkidle")


def no_overflow(page):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), page.url


def manifest(name, package_id):
    return {
        "format": 1,
        "sdk": "^0.1.0",
        "id": package_id,
        "version": "1.0.0",
        "kind": "scenario",
        "name": name,
        "description": "Test scenario",
        "author": "UI test",
        "entry": "index.mjs",
        "permissions": {},
        "settings": {"type": "object", "properties": {}},
        "inputs": {"events": {"contract": "test/events", "version": "^2.0.0"}},
    }


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    for action, value in [("locale", "en"), ("theme", "night")]:
        response = context.request.post(
            base + "/api/settings",
            headers={"Origin": base},
            data={"action": action, action: value},
        )
        assert response.ok, response.text()
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    # Real profile save, held in flight to reproduce edit/duplicate-submit races.
    visit(page, "/profiles")
    page.get_by_role("link", name="+ Create profile").click()
    field = page.get_by_role("textbox", name="Profile name", exact=True)
    expect(field).to_be_visible()
    field.fill("UI audit " + suffix)
    held = []

    def hold_save(route):
        if route.request.method == "POST":
            held.append(route)
        else:
            route.continue_()

    page.route("**/api/settings", hold_save)
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.locator("form")).to_have_attribute("aria-busy", "true")
    expect(field).to_be_disabled()
    expect(page.locator("form > fieldset")).to_have_attribute("inert", "")
    page.locator("form").dispatch_event("submit")
    assert len(held) == 1, "Duplicate submission escaped the shared form lock"
    held.pop().continue_()
    page.wait_for_url(re.compile(r"/profiles/(?!new$)[^/]+$"))
    expect(page.locator("form")).to_have_attribute("aria-busy", "false")
    page.unroute("**/api/settings", hold_save)
    profile_url = page.url
    expect(field).to_have_value("UI audit " + suffix)
    assert any(
        profile["name"] == "UI audit " + suffix
        for profile in context.request.get(base + "/api/settings").json()["profiles"]
    )

    # A failed request must unlock the form without discarding its draft.
    field.fill("UI changed " + suffix)
    page.route(
        "**/api/settings",
        lambda route: (
            route.fulfill(status=500, json={"error": "error"})
            if route.request.method == "POST"
            else route.continue_()
        ),
    )
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.locator("form")).to_have_attribute("aria-busy", "false")
    expect(field).to_be_enabled()
    page.unroute("**/api/settings")

    # Sidebar, browser Back, reload, and deliberate Cancel have distinct behavior.
    page.get_by_role("link", name="Screens", exact=True).click()
    expect(page.get_by_role("alertdialog")).to_be_visible()
    page.get_by_role("button", name="Keep editing").click()
    expect(field).to_have_value("UI changed " + suffix)
    page.evaluate("history.back()")
    expect(page.get_by_role("alertdialog")).to_be_visible()
    page.get_by_role("button", name="Keep editing").click()
    dialogs = []

    def dismiss_reload(dialog):
        dialogs.append(dialog.type)
        dialog.dismiss()

    page.on("dialog", dismiss_reload)
    try:
        page.reload(timeout=3000)
    except Error:
        pass
    assert dialogs == ["beforeunload"], dialogs
    expect(field).to_have_value("UI changed " + suffix)
    page.remove_listener("dialog", dismiss_reload)
    page.get_by_role("link", name="Cancel", exact=True).click()
    page.wait_for_url(base + "/profiles")
    assert page.get_by_role("alertdialog").count() == 0

    # Real deletion: cancellation preserves the record; confirmation removes it.
    visit(page, profile_url.removeprefix(base))
    page.get_by_role("button", name="Delete", exact=True).click()
    page.get_by_role("alertdialog").get_by_role("button", name="Cancel").click()
    expect(field).to_be_visible()
    page.get_by_role("button", name="Delete", exact=True).click()
    page.get_by_role("alertdialog").get_by_role("button", name="Delete").click()
    page.wait_for_url(base + "/profiles")

    visit(page, "/screens/new")
    page.get_by_label("Screen name", exact=True).fill("UI screen " + suffix)
    screen_id = "ui-" + suffix
    page.locator("#screen-id").fill(screen_id)
    page.route("**/api/settings", hold_save)
    page.get_by_role("button", name="Save", exact=True).click()
    expect(page.locator("#screen-name")).to_be_disabled()
    page.locator("form").dispatch_event("submit")
    assert len(held) == 1
    held.pop().continue_()
    page.wait_for_url(f"**/screens/{screen_id}/edit")
    page.unroute("**/api/settings", hold_save)
    expect(page.locator("form")).to_have_attribute("aria-busy", "false")
    page.get_by_role("button", name="Delete", exact=True).click()
    page.get_by_role("alertdialog").get_by_role("button", name="Delete").click()
    page.wait_for_url(base + "/screens")

    # Deterministic extensions fixture covers both populated and empty catalogs.
    manifests = [
        manifest("Downloaded Alpha", "test/alpha"),
        manifest("Downloaded Beta", "test/beta"),
    ]
    status = {
        "packages": [
            {"manifest": m, "explicit": True, "unused": True, "official": False}
            for m in manifests
        ],
        "instances": [],
        "connections": [],
        "operations": [],
        "runtime": {"ready": True, "error": None},
        "canRollback": False,
    }
    page.route("**/api/extensions", lambda route: route.fulfill(json=status))
    for width in [390, 1280]:
        page.set_viewport_size({"width": width, "height": 844})
        visit(page, "/scenarios")
        page.get_by_role("button", name="Add scenario").click()
        page.get_by_role("tab", name="My scenarios").click()
        panel = page.get_by_role("tabpanel")
        links = panel.get_by_role("link")
        expect(links).to_have_count(2)
        first, second = links.nth(0).bounding_box(), links.nth(1).bounding_box()
        assert second["y"] >= first["y"] + first["height"], "Catalog cards must stack"
        assert panel.evaluate(
            "el => el.scrollWidth <= el.clientWidth"
        ), "Catalog overflows"
        page.get_by_role("button", name="Close", exact=True).click()
        no_overflow(page)

    page.set_viewport_size({"width": 1280, "height": 900})
    visit(page, "/scenarios/new?package=test%2Falpha")
    expect(page.get_by_text("No compatible connections", exact=True)).to_be_visible()
    expect(page.get_by_role("link", name="Add connection", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="Save", exact=True)).to_be_disabled()
    status["connections"] = [
        {
            "id": "old",
            "name": "Incompatible calendar",
            "contracts": {"events": {"id": "test/events", "version": "1.0.0"}},
        },
        {
            "id": "new",
            "name": "Compatible calendar",
            "contracts": {"events": {"id": "test/events", "version": "2.1.0"}},
        },
    ]
    page.reload()
    expect(page.get_by_role("checkbox", name="Compatible calendar")).to_be_visible()
    expect(page.get_by_role("checkbox", name="Incompatible calendar")).to_have_count(0)
    page.get_by_role("checkbox", name="Compatible calendar").check()
    expect(page.get_by_role("button", name="Save", exact=True)).to_be_enabled()
    page.get_by_role("link", name="Scenarios", exact=True).click()
    page.get_by_role("button", name="Leave", exact=True).click()
    page.wait_for_url(base + "/scenarios")

    integration = {
        **manifest("Test connection", "test/connection"),
        "kind": "integration",
    }
    del integration["inputs"]
    status["packages"].append(
        {"manifest": integration, "explicit": True, "unused": True, "official": False}
    )
    visit(page, "/connections/new?package=test%2Fconnection")
    page.get_by_role("textbox", name="Name", exact=True).fill("Unsaved connection")
    page.get_by_role("link", name="Screens", exact=True).click()
    expect(page.get_by_role("alertdialog")).to_be_visible()
    page.get_by_role("button", name="Keep editing").click()
    expect(page.get_by_role("textbox", name="Name", exact=True)).to_have_value(
        "Unsaved connection"
    )
    page.get_by_role("link", name="Cancel", exact=True).click()
    page.wait_for_url(base + "/connections")

    # Both locales and palettes, narrow resource/gallery layouts, real shared styles.
    for locale, theme in [("en", "night"), ("ru", "day")]:
        for action, value in [("locale", locale), ("theme", theme)]:
            response = context.request.post(
                base + "/api/settings",
                headers={"Origin": base},
                data={"action": action, action: value},
            )
            assert response.ok, response.text()
        for width in [390, 1280]:
            page.set_viewport_size({"width": width, "height": 844})
            for path in ["/screens", "/profiles", "/settings", "/design-system"]:
                visit(page, path)
                no_overflow(page)
            for card in page.locator('[data-variant="resource"]').all():
                assert card.evaluate(
                    "el => el.scrollWidth <= el.clientWidth"
                ), "Long card content is clipped"
            page.screenshot(path=f"/tmp/peek-ui-{locale}-{width}.png", full_page=True)
            page.locator("#compositions-title").scroll_into_view_if_needed()
            page.screenshot(path=f"/tmp/peek-ui-compositions-{locale}-{width}.png")
            page.get_by_label("Пример имени", exact=True).fill("Несохранённый пример")
            page.get_by_role("link", name="Добавить экран", exact=True).click()
            expect(page.get_by_role("alertdialog")).to_be_visible()
            page.get_by_role("button", name="Остаться", exact=True).click()
            page.get_by_role("button", name="Сохранить пример", exact=True).click()
            expect(page.locator("form")).to_have_attribute("aria-busy", "false")
    assert not errors, errors
    browser.close()
    print(
        "PASS: delayed saves, navigation guards, deletion, catalog, bindings, locales and responsive layouts"
    )
