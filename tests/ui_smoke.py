"""Run against an isolated Peek database: uv run --with playwright python tests/ui_smoke.py URL.

Profile/screen checks use real writes. Extension UI uses deterministic API fixtures;
it does not require or test the Docker runner.
"""

import sys
import base64
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
        "format": 3,
        "sdk": "^0.2.0",
        "id": package_id,
        "version": "1.0.0",
        "kind": "scenario",
        "name": name,
        "description": "Test scenario",
        "author": "UI test",
        "entry": "index.mjs",
        "permissions": {},
        "settings": {"type": "object", "properties": {}},
        "settingsUi": {"blocks": []},
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
                expect(page.get_by_text("Scenario or connection not found", exact=True)).to_be_visible()
            else:
                expect(page.locator("header nav")).to_be_visible()
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
                expect(page.get_by_role("button", name="Create", exact=True)).to_be_enabled()
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
                page.locator("header").get_by_role("link", name="Screens" if path == "/screens/new" else "Profiles", exact=True).click()
                page.get_by_role("button", name="Leave", exact=True).click()
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
    page.get_by_role("button", name="Create", exact=True).click()
    expect(page.locator("form")).to_have_attribute("aria-busy", "true")
    expect(field).to_be_disabled()
    expect(page.locator("form > fieldset")).to_have_attribute("inert", "")
    page.locator("form").dispatch_event("submit")
    assert len(held) == 1, "Duplicate submission escaped the shared form lock"
    held.pop().continue_()
    page.wait_for_url(base + "/profiles")
    expect(page.locator('[data-sonner-toast]').filter(has_text="Profile created")).to_be_visible()
    page.unroute("**/api/settings", hold_save)
    created = next(p for p in context.request.get(base + "/api/settings").json()["profiles"] if p["name"] == "UI audit " + suffix)
    page.get_by_role("link", name="UI audit " + suffix, exact=True).click()
    page.wait_for_url(base + "/profiles/" + created["id"])
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
    page.locator("[data-setting=identity]").get_by_role("button", name="Save", exact=True).click()
    expect(page.locator("[aria-busy]")).to_have_attribute("aria-busy", "false")
    expect(field).to_be_enabled()
    page.unroute("**/api/settings")

    # Sidebar, browser Back, reload, and breadcrumb navigation guard pending changes.
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
    page.locator("header").get_by_role("link", name="Profiles", exact=True).click()
    page.get_by_role("button", name="Leave", exact=True).click()
    page.wait_for_url(base + "/profiles")
    assert page.get_by_role("alertdialog").count() == 0

    # Real deletion: cancellation preserves the record; confirmation removes it.
    visit(page, profile_url.removeprefix(base))
    page.get_by_role("button", name="Actions", exact=True).click()
    page.get_by_role("menuitem", name="Delete", exact=True).click()
    page.get_by_role("alertdialog").get_by_role("button", name="Cancel").click()
    expect(page.get_by_role("alertdialog")).to_have_count(0)
    page.keyboard.press("Escape")
    expect(field).to_be_visible()
    page.get_by_role("button", name="Actions", exact=True).click()
    page.get_by_role("menuitem", name="Delete", exact=True).click()
    page.get_by_role("alertdialog").get_by_role("button", name="Delete").click()
    page.wait_for_url(base + "/profiles")

    visit(page, "/screens/new")
    page.get_by_label("Screen name", exact=True).fill("UI screen " + suffix)
    screen_id = "ui-" + suffix
    page.locator("#screen-id").fill(screen_id)
    page.route("**/api/settings", hold_save)
    page.get_by_role("button", name="Create", exact=True).click()
    expect(page.locator("#screen-name")).to_be_disabled()
    page.locator("form").dispatch_event("submit")
    assert len(held) == 1
    held.pop().continue_()
    page.wait_for_url(base + "/screens")
    expect(page.locator('[data-sonner-toast]').filter(has_text="Screen created")).to_be_visible()
    page.unroute("**/api/settings", hold_save)
    visit(page, f"/screens/{screen_id}/edit")
    expect(page.locator("[aria-busy]")).to_have_attribute("aria-busy", "false")
    page.get_by_role("button", name="Actions", exact=True).click()
    page.get_by_role("menuitem", name="Delete", exact=True).click()
    page.get_by_role("alertdialog").get_by_role("button", name="Delete").click()
    page.wait_for_url(base + "/screens")

    # Deterministic extensions fixture covers both populated and empty catalogs.
    manifests = [
        manifest("Downloaded Alpha", "test/alpha"),
        manifest("Downloaded Beta", "test/beta"),
    ]
    icon_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#3b82f6"/></svg>'
    def icon_url(svg):
        return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()
    icon = icon_url(icon_svg)
    status = {
        "packages": [
            {"manifest": m, "iconDataUrl": icon, "explicit": True, "unused": True, "official": False}
            for m in manifests
        ],
        "instances": [],
        "connections": [],
        "operations": [],
        "runtime": {"ready": True, "error": None},
        "canRollback": False,
    }
    status["packages"][0]["manifest"]["iconColor"] = "theme"
    run_requests = []
    def extension_route(route):
        if route.request.method == "POST":
            body = route.request.post_data_json
            if body.get("action") == "run":
                run_requests.append(body["id"])
            if body.get("action") == "set-enabled":
                instance = next(i for i in status["instances"] if i["id"] == body["id"])
                instance["enabled"] = int(body["enabled"])
        route.fulfill(json=status)
    page.route("**/api/extensions", extension_route)
    for width in [390, 1280]:
        page.set_viewport_size({"width": width, "height": 844})
        visit(page, "/scenarios")
        page.get_by_role("button", name="Add scenario").click()
        page.get_by_role("tab", name="My scenarios").click()
        panel = page.get_by_role("tabpanel")
        links = panel.get_by_role("link")
        expect(links).to_have_count(2)
        expect(links.nth(0).locator('[data-icon-color="theme"]')).to_be_visible()
        expect(links.nth(1).locator('[data-icon-color="original"]')).to_be_visible()
        first, second = links.nth(0).bounding_box(), links.nth(1).bounding_box()
        assert second["y"] >= first["y"] + first["height"], "Catalog cards must stack"
        assert panel.evaluate(
            "el => el.scrollWidth <= el.clientWidth"
        ), "Catalog overflows"
        page.get_by_role("button", name="Close", exact=True).click()
        no_overflow(page)

    # Package SVG stays in image context, including hostile artwork.
    probes = []
    page.route("**/icon-probe**", lambda route: (probes.append(route.request.url), route.abort()))
    hostile = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" onload="window.__iconExecuted=true;fetch('{base}/icon-probe-load')">
      <script>window.__iconExecuted=true;fetch('{base}/icon-probe-script')</script>
      <image href="{base}/icon-probe-image" width="32" height="32"/>
      <style>@import url('{base}/icon-probe-css');</style>
      <foreignObject width="32" height="32"><div xmlns="http://www.w3.org/1999/xhtml"><img src="{base}/icon-probe-html" onerror="window.__iconExecuted=true"/></div></foreignObject>
      <circle cx="16" cy="16" r="10" fill="#3b82f6"/>
    </svg>'''
    status["packages"][0]["iconDataUrl"] = icon_url(hostile)
    status["packages"][1]["iconDataUrl"] = icon_url("not an SVG")
    status["packages"][1]["manifest"]["iconColor"] = "theme"
    visit(page, "/settings/extensions")
    rows = page.locator('[data-variant="resource"]')
    expect(rows).to_have_count(2)
    image = rows.first.locator('[data-slot="extension-icon"] img')
    expect(image).to_be_visible()
    page.wait_for_function("document.querySelector('[data-slot=extension-icon] img').naturalWidth > 0")
    expect(rows.nth(1).locator('[data-slot="extension-icon"] svg')).to_be_visible()
    assert not probes, probes
    assert page.evaluate("window.__iconExecuted === undefined")
    assert page.locator('script').evaluate_all("els => els.every(el => !el.textContent.includes('icon-probe-script'))")
    # A changed source retries a formerly failed image without navigation.
    status["packages"][1]["iconDataUrl"] = icon
    expect(rows.nth(1).locator('[data-slot="extension-icon"] img')).to_be_visible(timeout=10000)
    status["packages"][0]["iconDataUrl"] = icon
    del status["packages"][1]["manifest"]["iconColor"]

    page.set_viewport_size({"width": 1280, "height": 900})
    visit(page, "/scenarios/new?package=test%2Falpha")
    expect(page.get_by_role("heading", name="Configure Downloaded Alpha", exact=True)).to_be_visible()
    expect(page.get_by_text("No compatible connections", exact=True)).to_be_visible()
    expect(page.get_by_role("link", name="Add connection", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="Create", exact=True)).to_be_disabled()
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
    expect(page.get_by_role("button", name="Create", exact=True)).to_be_enabled()
    page.get_by_role("navigation", name="Main navigation").get_by_role("link", name="Scenarios", exact=True).click()
    page.get_by_role("button", name="Leave", exact=True).click()
    page.wait_for_url(base + "/scenarios")

    connection = {
        **manifest("Test connection", "test/connection"),
        "kind": "connection",
    }
    del connection["inputs"]
    status["packages"].append(
        {"manifest": connection, "iconDataUrl": icon, "explicit": True, "unused": True, "official": False}
    )
    held_profiles = []
    page.route("**/api/settings", lambda route: held_profiles.append(route))
    page.goto(base + "/connections/new?package=test%2Fconnection")
    name_field = page.get_by_role("textbox", name="Name", exact=True)
    expect(name_field).to_be_visible()
    expect(page.get_by_text("Enabled", exact=True)).to_have_count(0)
    name_field.fill("Unsaved connection")
    expect(page.locator('[data-slot="skeleton"]')).to_have_count(0)
    while held_profiles:
        held_profiles.pop(0).continue_()
    page.unroute("**/api/settings")
    expect(page.locator('[data-slot="skeleton"]')).to_have_count(0)
    expect(name_field).to_have_value("Unsaved connection")
    editor_title = page.get_by_role("heading", name="Configure Test connection", exact=True)
    expect(editor_title).to_be_visible()
    # Removing the package remotely must not unmount the open editor.
    status["packages"].pop()
    with page.expect_response("**/api/settings"):
        pass
    expect(name_field).to_have_value("Unsaved connection")
    expect(editor_title).to_be_visible()
    page.get_by_role("link", name="Screens", exact=True).click()
    expect(page.get_by_role("alertdialog")).to_be_visible()
    page.get_by_role("button", name="Keep editing").click()
    expect(page.get_by_role("textbox", name="Name", exact=True)).to_have_value(
        "Unsaved connection"
    )
    page.get_by_role("navigation", name="Main navigation").get_by_role("link", name="Connections", exact=True).click()
    page.get_by_role("button", name="Leave", exact=True).click()
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
        {"manifest": connection, "iconDataUrl": icon, "explicit": True, "unused": False, "official": False}
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
            "enabled": 1 if kind == "connection" else enabled,
            "settings": {},
            "bindings": {"events": [{"connectionId": "new", "dataset": "events"}]},
            "hasSecret": False,
            "last_error": None if enabled else "Calendar unavailable. Check connection settings.",
            "last_success": 1792872000000 if enabled else None,
            "cardCount": 3 if enabled else 0,
            "next_run_at": None,
        }
        for kind, package_id in [("scenario", "peek/meetings"), ("connection", "peek/ical")]
        for enabled, name in [(1, "Family calendar"), (0, "A very long household calendar name for school, work and weekend activities")]
    ]

    theme_colors = {}
    # Both locales and palettes, narrow resource layouts, real shared styles.
    for locale, theme in [("en", "night"), ("ru", "day"), ("en", "oled")]:
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
                if width == 390 and path != "/settings":
                    search = page.locator('input[type="search"]')
                    toolbar = search.locator("../..")
                    action = toolbar.locator("a, button").first.bounding_box()
                    field = search.bounding_box()
                    assert action["y"] + action["height"] < field["y"]
                    assert abs(action["width"] - field["width"]) < 2
                if path == "/screens" and width == 390:
                    page.get_by_role("button", name="Toggle sidebar" if locale == "en" else "Переключить меню", exact=True).click()
                    sidebar = page.get_by_role("dialog", name="Sidebar" if locale == "en" else "Боковая панель", exact=True)
                    expect(sidebar).to_be_visible()
                    sidebar.get_by_role("button", name="Close" if locale == "en" else "Закрыть", exact=True).click()
                    expect(sidebar).not_to_be_visible()
                if path == "/profiles":
                    rows = page.locator('[data-variant="profile"]')
                    expect(rows.first.locator('[data-slot="avatar"]')).to_be_visible()
                    rows.first.get_by_role("button", name="Actions" if locale == "en" else "Действия", exact=True).click()
                    expect(page.get_by_role("menuitem", name="Delete" if locale == "en" else "Удалить", exact=True)).to_be_disabled()
                    edit = page.get_by_role("menuitem", name="Edit" if locale == "en" else "Изменить", exact=True)
                    href = edit.get_attribute("href")
                    edit.click()
                    expect(page).to_have_url(base + href)
                    visit(page, "/profiles")
                    page.screenshot(path=f"/tmp/peek-profiles-{locale}-{width}.png", full_page=True)
                if path in ["/scenarios", "/connections"]:
                    cards = page.locator('tbody tr')
                    expect(cards).to_have_count(2)
                    if path == "/scenarios" and width == 390:
                        first, second = cards.nth(0).bounding_box(), cards.nth(1).bounding_box()
                        assert second["y"] - (first["y"] + first["height"]) >= 15
                        cells = cards.first.locator("td")
                        name, health, card_count, profile, actions = [cells.nth(i).bounding_box() for i in range(5)]
                        assert abs(name["y"] - health["y"]) < 2
                        assert profile["y"] >= name["y"] + name["height"]
                        assert abs(profile["y"] - actions["y"]) < 2
                        expect(cards.last).to_have_css("border-bottom-width", "1px")
                        background = page.locator("body").evaluate("el => getComputedStyle(el).backgroundColor")
                        expect(cells.nth(4)).to_have_css("background-color", background)
                        expect(cells.nth(3)).to_have_css("background-color", background)
                        page.screenshot(path=f"/tmp/peek-scenario-cards-{locale}-{theme}.png")
                    if path == "/connections":
                        expect(page.get_by_text("Connected" if locale == "en" else "Подключён", exact=True)).to_be_visible()
                        expect(page.get_by_text("Needs attention" if locale == "en" else "Требует внимания", exact=True)).to_be_visible()
                    if path == "/scenarios" and theme == "oled":
                        page.mouse.move(0, 0)
                        expect(cards.first).to_have_css("background-color", "rgb(10, 10, 10)")
                        expect(cards.first).to_have_css("border-bottom-color", "rgb(36, 36, 36)")
                        assert "rgb(36, 36, 36) 0px -1px 0px 0px inset" in cards.first.evaluate("el => getComputedStyle(el).boxShadow")
                        search = page.locator('input[type="search"]')
                        expect(search).to_have_css("background-color", "rgb(10, 10, 10)")
                        expect(search).to_have_css("border-color", "rgb(33, 33, 33)")
                        if width == 1280:
                            active = page.locator('[data-sidebar="menu-button"][data-active="true"]')
                            expect(active).to_have_css("background-color", "rgb(31, 31, 31)")
                            expect(active).to_have_css("color", "rgb(237, 237, 237)")
                            inactive = page.locator('[data-sidebar="menu-button"][data-active="false"]').first
                            expect(inactive).to_have_css("color", "rgb(161, 161, 161)")
                            expect(page.locator('[data-slot="sidebar-inner"]')).to_have_css("background-color", "rgb(0, 0, 0)")
                        cards.first.hover()
                        expect(cards.first).to_have_css("background-color", "rgb(26, 26, 26)")
                        page.mouse.move(0, 0)
                    expect(cards.first.locator('[data-slot="extension-icon"]').first).to_be_visible()
                    if path == "/scenarios":
                        mask = cards.first.locator('[data-icon-color="theme"]').first
                        expect(mask).to_be_visible()
                        theme_colors[theme] = mask.evaluate("el => getComputedStyle(el).backgroundColor")
                        assert mask.evaluate("el => getComputedStyle(el).maskImage.startsWith('url(')")
                        assert mask.evaluate("el => getComputedStyle(el).maskMode === 'alpha'")
                        expect(cards.nth(1).locator('[data-icon-color="original"]')).to_be_visible()
                    expect(cards.nth(1).get_by_role("status")).to_contain_text("Calendar unavailable")
                    if path == "/scenarios":
                        expect(cards.locator("details")).to_have_count(0)
                        expect(cards.get_by_text("Compatible calendar", exact=True)).to_have_count(0)
                        expect(cards.get_by_role("button", name="Delete" if locale == "en" else "Удалить", exact=True)).to_have_count(0)
                        expect(cards.first.locator("td")).to_have_count(5)
                        expect(cards.first.get_by_text("3 cards" if locale == "en" else "3 карточки", exact=True)).to_be_visible()
                        expect(cards.nth(1).get_by_text("0 cards" if locale == "en" else "0 карточек", exact=True)).to_be_visible()
                        expect(cards.first.get_by_text("Cards refreshed", exact=False)).to_have_count(0)
                        menu = cards.first.get_by_role("button", name="Actions" if locale == "en" else "Действия", exact=True)
                        menu.click()
                        refresh = page.get_by_role("menuitem", name="Refresh cards" if locale == "en" else "Обновить карточки", exact=True)
                        previous_runs = len(run_requests)
                        with page.expect_response(lambda response: response.url.endswith("/api/extensions") and response.request.method == "POST"):
                            refresh.click()
                        assert len(run_requests) == previous_runs + 1
                        assert run_requests[-1] == "card-scenario-1"
                        cards.nth(1).get_by_role("button", name="Actions" if locale == "en" else "Действия", exact=True).click()
                        expect(page.get_by_role("menuitem", name="Refresh cards" if locale == "en" else "Обновить карточки", exact=True)).to_be_disabled()
                        page.keyboard.press("Escape")
                        expect(cards.nth(1).get_by_role("button", name="Actions" if locale == "en" else "Действия", exact=True)).to_be_focused()
                        health = cards.first.get_by_role("button", name="Health: Healthy" if locale == "en" else "Состояние: Работает", exact=True)
                        health.focus()
                        expect(page.get_by_role("tooltip")).to_contain_text("Last success" if locale == "en" else "Успешный запуск")
                        expect(page.get_by_role("tooltip")).to_contain_text("2026")
                        expect(page.locator('[data-slot="tooltip-content"]')).to_have_css("font-size", "11px")
                        expect(page.get_by_role("tooltip")).not_to_contain_text("Refresh cards in the menu")
                        expect(page.locator('[data-slot="tooltip-content"] time')).to_have_attribute("datetime", "2026-10-24T20:00:00.000Z")
                        avatar = cards.first.locator("td").nth(3).locator('[data-slot="tooltip-trigger"]')
                        avatar.focus()
                        expect(page.get_by_role("tooltip")).to_have_text("Shared" if locale == "en" else "Общее")
                        menu = cards.first.get_by_role("button", name="Actions" if locale == "en" else "Действия", exact=True)
                        expect(cards.first.get_by_text("Downloaded Alpha", exact=True)).to_have_count(0)
                        expect(cards.get_by_role("button", name="Disable scenario" if locale == "en" else "Выключить сценарий", exact=True)).to_have_count(0)
                        menu.click()
                        page.get_by_role("menuitem", name="Disable" if locale == "en" else "Выключить", exact=True).click()
                        expect(cards.first.get_by_role("button", name="Health: Paused" if locale == "en" else "Состояние: Приостановлен", exact=True)).to_be_visible()
                        menu.click()
                        page.get_by_role("menuitem", name="Enable" if locale == "en" else "Включить", exact=True).click()
                        expect(health).to_be_visible()
                        menu.click()
                        # A server poll must update cells without remounting the open menu.
                        with page.expect_response(lambda r: r.url.endswith("/api/extensions") and r.request.method == "GET"):
                            pass
                        expect(page.get_by_role("menu")).to_be_visible()
                        expect(page.get_by_role("menuitem", name="Edit" if locale == "en" else "Изменить", exact=True)).to_be_visible()
                        page.get_by_role("menuitem", name="Delete" if locale == "en" else "Удалить", exact=True).click()
                        expect(page.get_by_role("alertdialog")).to_be_visible()
                        page.get_by_role("button", name="Cancel" if locale == "en" else "Отмена", exact=True).click()
                        page.keyboard.press("Escape")
                        expect(page).to_have_url(base + "/scenarios")
                        href = cards.first.get_by_role("link").get_attribute("href")
                        cards.first.click(position={"x": 8, "y": 8})
                        expect(page).to_have_url(base + href)
                        visit(page, "/scenarios")
                        cards.first.get_by_role("link").focus()
                        page.keyboard.press("Enter")
                        expect(page).to_have_url(base + href)
                        visit(page, "/scenarios")
                    else:
                        expect(cards.first.locator("td")).to_have_count(4)
                        expect(cards.locator("details")).to_have_count(0)
                        menu = cards.first.get_by_role("button", name="Actions" if locale == "en" else "Действия", exact=True)
                        menu.click()
                        expect(page.get_by_role("menuitem", name="Disable" if locale == "en" else "Выключить", exact=True)).to_have_count(0)
                        refresh = page.get_by_role("menuitem", name="Refresh data" if locale == "en" else "Обновить данные", exact=True)
                        with page.expect_response(lambda response: response.url.endswith("/api/extensions") and response.request.method == "POST"):
                            refresh.click()
                        assert run_requests[-1] == "card-connection-1"
                        menu.click()
                        page.get_by_role("menuitem", name="Delete" if locale == "en" else "Удалить", exact=True).click()
                        expect(page.get_by_role("alertdialog")).to_be_visible()
                        page.get_by_role("button", name="Cancel" if locale == "en" else "Отмена", exact=True).click()
                        page.keyboard.press("Escape")
                        if width == 390:
                            cells = cards.first.locator("td")
                            name, health, profile, actions = [cells.nth(i).bounding_box() for i in range(4)]
                            assert abs(name["y"] - health["y"]) < 2
                            assert profile["y"] >= name["y"] + name["height"]
                            assert abs(profile["y"] - actions["y"]) < 2
                    page.screenshot(path=f"/tmp/peek-cards-{path[1:]}-{locale}-{width}.png", full_page=True)
                no_overflow(page)
                for card in page.locator('[data-variant="resource"]').all():
                    assert card.evaluate(
                        "el => el.scrollWidth <= el.clientWidth"
                    ), "Long card content is clipped"
            page.screenshot(path=f"/tmp/peek-ui-{locale}-{width}.png", full_page=True)
    assert theme_colors["night"] != theme_colors["day"], theme_colors
    # Real package upload previews bundled SVG before any runner installation.
    page.unroute("**/api/extensions")
    for locale, theme in [("en", "night"), ("ru", "day"), ("en", "oled")]:
        for action, value in [("locale", locale), ("theme", theme)]:
            response = context.request.post(base + "/api/settings", headers={"Origin": base}, data={"action": action, action: value})
            assert response.ok, response.text()
        for width in [390, 1280]:
            page.set_viewport_size({"width": width, "height": 844})
            visit(page, "/settings/extensions")
            page.get_by_label("Package file" if locale == "en" else "Файл пакета").set_input_files("extensions/dist/official.peek")
            expect(page.get_by_role("button", name="Accept and install" if locale == "en" else "Принять и установить")).to_be_visible()
            icons = page.locator('[data-slot="extension-icon"] img')
            expect(icons).to_have_count(3)
            page.wait_for_function("Array.from(document.querySelectorAll('[data-slot=extension-icon] img')).every(img => img.naturalWidth > 0)")
            no_overflow(page)
            page.screenshot(path=f"/tmp/peek-icons-review-{locale}-{width}.png", full_page=True)
            page.get_by_role("button", name="Cancel" if locale == "en" else "Отмена", exact=True).click()
            expect(icons).to_have_count(0)
    assert not errors, errors
    browser.close()
    print(
        "PASS: delayed saves, navigation guards, deletion, catalog, bindings, locales and responsive layouts"
    )
