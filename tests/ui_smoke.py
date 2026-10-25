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
        "format": 2,
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
        "contracts": [{"id": "test/events", "version": "2.1.0", "schema": {"type": "array"}}],
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
    # A refresh must contain real content even when JavaScript cannot run.
    static_context = browser.new_context(java_script_enabled=False)
    static_page = static_context.new_page()
    for path in ["/screens", "/profiles", "/scenarios", "/connections", "/settings/extensions", "/screens/new", "/profiles/new"]:
        static_page.goto(base + path)
        expect(static_page.locator('[data-slot="skeleton"]')).to_have_count(0)
        expect(static_page.locator("main")).to_be_visible()
    static_page.goto(base + "/profiles")
    expect(static_page.get_by_text("Shared", exact=True)).to_be_visible()
    static_context.close()

    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))

    # An old initial response must not undo a preference saved in the meantime.
    old_settings = context.request.get(base + "/api/settings").json()
    held_preferences = []
    def hold_preference_reads(route):
        if route.request.method == "GET":
            held_preferences.append(route)
        else:
            route.continue_()
    page.route("**/api/settings", hold_preference_reads)
    page.goto(base + "/settings")
    theme = page.get_by_role("combobox", name="Appearance theme")
    expect(theme).to_be_enabled()
    theme.click()
    page.get_by_role("option", name="Light", exact=True).click()
    expect(page.locator("html")).to_have_attribute("data-theme", "day")
    held_preferences.pop(0).fulfill(json=old_settings)
    while held_preferences:
        held_preferences.pop(0).continue_()
    page.unroute("**/api/settings")
    expect(page.locator("html")).to_have_attribute("data-theme", "day")
    context.request.post(base + "/api/settings", headers={"Origin": base}, data={"action": "theme", "theme": "night"})

    # Server-rendered content and controls work before background API reads finish.
    for width in [1280, 390]:
        page.set_viewport_size({"width": width, "height": 900})
        for path in ["/screens", "/profiles", "/scenarios", "/connections", "/settings/extensions"]:
            held_loads = []
            page.route("**/api/settings", lambda route: held_loads.append(route))
            page.route("**/api/extensions", lambda route: held_loads.append(route))
            page.goto(base + path)
            search = page.get_by_role("searchbox")
            expect(search).to_be_visible()
            search.fill("no-matching-resource")
            expect(page.locator('[data-slot="skeleton"]')).to_have_count(0)
            if path in ["/scenarios", "/connections"]:
                expect(page.get_by_role("button", name=re.compile(r"^\+ Add"))).to_be_enabled()
            elif path != "/settings/extensions":
                expect(page.get_by_role("link", name=re.compile(r"^\+"))).to_be_visible()
            no_overflow(page)
            while held_loads:
                held_loads.pop(0).continue_()
            page.unroute("**/api/settings")
            page.unroute("**/api/extensions")
            page.wait_for_load_state("networkidle")
            expect(page.locator('[data-slot="skeleton"]')).to_have_count(0)
            expect(search).to_have_value("no-matching-resource")
        for path in ["/screens/new", "/profiles/new", "/scenarios/new", "/connections/new"]:
            held_loads = []
            page.route("**/api/settings", lambda route: held_loads.append(route))
            page.route("**/api/extensions", lambda route: held_loads.append(route))
            page.goto(base + path)
            if path in ["/scenarios/new", "/connections/new"]:
                expect(page.get_by_text("Scenario or connection not found.", exact=True)).to_be_visible()
            else:
                expect(page.get_by_role("link", name=re.compile("Back to|All screens|All profiles"))).to_be_visible()
            if path == "/profiles/new":
                expect(page.locator('[data-slot="skeleton"]')).to_have_count(0)
                draft = page.get_by_role("textbox", name="Profile name", exact=True)
                draft.fill("Profile typed before data")
                page.get_by_role("radio", name="Green", exact=True).check()
            else:
                expect(page.locator('[data-slot="skeleton"]')).to_have_count(0)
            if path == "/screens/new":
                draft = page.locator("#screen-name")
                draft.fill("Screen typed before data")
                page.locator("#screen-id").fill("my-custom-id")
                page.locator("#screen-all").uncheck()
                page.get_by_role("radio", name="120%", exact=True).click()
                expect(page.get_by_role("button", name="Save", exact=True)).to_be_enabled()
            no_overflow(page)
            while held_loads:
                held_loads.pop(0).continue_()
            page.unroute("**/api/settings")
            page.unroute("**/api/extensions")
            page.wait_for_load_state("networkidle")
            if path == "/profiles/new":
                expect(draft).to_have_value("Profile typed before data")
                expect(page.get_by_role("radio", name="Green", exact=True)).to_be_checked()
            if path == "/screens/new":
                expect(draft).to_have_value("Screen typed before data")
                expect(page.locator("#screen-id")).to_have_value("my-custom-id")
                expect(page.locator("#screen-all")).not_to_be_checked()
                expect(page.get_by_role("radio", name="120%", exact=True)).to_be_checked()
                expect(page.locator('[data-slot="skeleton"]')).to_have_count(0)
            if path in ["/screens/new", "/profiles/new"]:
                page.get_by_role("link", name="Cancel", exact=True).click()
                page.wait_for_url(base + path.removesuffix("/new"))
    page.set_viewport_size({"width": 1280, "height": 900})

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

    connection = {
        **manifest("Test connection", "test/connection"),
        "kind": "connection",
    }
    del connection["inputs"]
    status["packages"].append(
        {"manifest": connection, "explicit": True, "unused": True, "official": False}
    )
    held_profiles = []
    page.route("**/api/settings", lambda route: held_profiles.append(route))
    page.goto(base + "/connections/new?package=test%2Fconnection")
    name_field = page.get_by_role("textbox", name="Name", exact=True)
    expect(name_field).to_be_visible()
    name_field.fill("Unsaved connection")
    expect(page.locator('[data-slot="skeleton"]')).to_have_count(0)
    while held_profiles:
        held_profiles.pop(0).continue_()
    page.unroute("**/api/settings")
    expect(page.locator('[data-slot="skeleton"]')).to_have_count(0)
    expect(name_field).to_have_value("Unsaved connection")
    # Removing the package remotely must not unmount the open editor.
    status["packages"].pop()
    with page.expect_response("**/api/settings"):
        pass
    expect(name_field).to_have_value("Unsaved connection")
    page.get_by_role("link", name="Screens", exact=True).click()
    expect(page.get_by_role("alertdialog")).to_be_visible()
    page.get_by_role("button", name="Keep editing").click()
    expect(page.get_by_role("textbox", name="Name", exact=True)).to_have_value(
        "Unsaved connection"
    )
    page.get_by_role("link", name="Cancel", exact=True).click()
    page.wait_for_url(base + "/connections")

    visit(page, "/settings/extensions")
    search = page.get_by_role("searchbox")
    search.fill("unmatched-package")
    release_url = page.get_by_role("textbox", name="Release URL", exact=True)
    release_url.fill("https://example.com/unfinished")
    with page.expect_response("**/api/extensions"):
        pass
    expect(search).to_have_value("unmatched-package")
    expect(release_url).to_have_value("https://example.com/unfinished")

    # Instance cards keep context and errors visible, with timestamps on demand.
    status["packages"].append(
        {"manifest": connection, "explicit": True, "unused": False, "official": False}
    )
    for package, package_id in zip(status["packages"], ["peek/meetings", "peek/deadlines", "peek/ical"]):
        package["manifest"]["id"] = package_id
    status["instances"] = [
        {
            "id": f"card-{kind}-{enabled}",
            "package_id": "peek/deadlines" if kind == "scenario" and not enabled else package_id,
            "kind": kind,
            "name": name,
            "profile_id": "shared",
            "enabled": enabled,
            "settings": {},
            "bindings": {"events": [{"connectionId": "new", "dataset": "events"}]},
            "hasSecret": False,
            "last_error": None if enabled else "Calendar unavailable. Check connection settings.",
            "last_success": 1792872000000 if enabled else None,
            "next_run_at": None,
        }
        for kind, package_id in [("scenario", "peek/meetings"), ("connection", "peek/ical")]
        for enabled, name in [(1, "Family calendar"), (0, "A very long household calendar name for school, work and weekend activities")]
    ]

    # Both locales and palettes, narrow resource layouts, real shared styles.
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
            for path in ["/screens", "/profiles", "/settings", "/scenarios", "/connections"]:
                visit(page, path)
                if path in ["/scenarios", "/connections"]:
                    cards = page.locator('[data-variant="resource"]')
                    expect(cards).to_have_count(2)
                    expect(cards.nth(1).get_by_role("status")).to_contain_text("Calendar unavailable")
                    details = cards.first.locator("details")
                    expect(details).not_to_have_attribute("open", "")
                    expect(details.locator("dl")).not_to_be_visible()
                    details.locator("summary").focus()
                    page.keyboard.press("Enter")
                    expect(details.locator("dl")).to_be_visible()
                    page.keyboard.press("Enter")
                    expect(details.locator("dl")).not_to_be_visible()
                    update_label = (
                        ("Update cards" if locale == "en" else "Обновить карточки")
                        if path == "/scenarios"
                        else ("Refresh data" if locale == "en" else "Обновить данные")
                    )
                    expect(cards.nth(1).get_by_role("button", name=update_label)).to_be_disabled()
                    expect(cards.first.locator('[data-slot="badge"]')).to_have_attribute("data-variant", "success")
                    expect(cards.first.get_by_role("button", name="Delete" if locale == "en" else "Удалить", exact=True)).to_have_attribute("data-variant", "destructive-ghost")
                    page.screenshot(path=f"/tmp/peek-cards-{path[1:]}-{locale}-{width}.png", full_page=True)
                no_overflow(page)
                for card in page.locator('[data-variant="resource"]').all():
                    assert card.evaluate(
                        "el => el.scrollWidth <= el.clientWidth"
                    ), "Long card content is clipped"
            page.screenshot(path=f"/tmp/peek-ui-{locale}-{width}.png", full_page=True)
    assert not errors, errors
    browser.close()
    print(
        "PASS: delayed saves, navigation guards, deletion, catalog, bindings, locales and responsive layouts"
    )
