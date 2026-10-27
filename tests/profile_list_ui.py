"""Run against an isolated database: uv run --with playwright python tests/profile_list_ui.py URL."""
import sys
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1].rstrip("/")
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context()
    page = context.new_page()
    def post(body):
        response = context.request.post(base + "/api/settings", headers={"Origin": base}, data=body)
        assert response.ok, response.text()
        return response.json()
    name = "A very long profile name for testing household resource lists"
    for profile in context.request.get(base + "/api/settings").json()["profiles"]:
        if profile["name"] == name and not profile["system"]:
            post({"action": "profile-delete", "id": profile["id"]})
    profile_id = post({"action": "profile-save", "config": {"name": name, "color": "blue"}})["id"]
    for locale, theme in [("en", "night"), ("ru", "day"), ("en", "oled")]:
        post({"action": "locale", "locale": locale})
        post({"action": "theme", "theme": theme})
        for width in [390, 1024, 1280]:
            page.set_viewport_size({"width": width, "height": 844})
            page.goto(base + "/profiles")
            page.wait_for_load_state("networkidle")
            row = page.locator('[data-variant="profile"]').filter(has_text=name)
            expect(page.get_by_text("System profile" if locale == "en" else "Системный профиль", exact=True)).to_have_count(0)
            avatar = row.locator('[data-slot="avatar"]')
            expect(avatar).to_have_css("width", "64px")
            identity = row.get_by_role("link", name=name)
            expect(identity).to_be_visible()
            expect(row.get_by_label("Connections" if locale == "en" else "Подключения", exact=True)).to_be_visible()
            expect(row.get_by_label("Scenarios" if locale == "en" else "Сценарии", exact=True)).to_be_visible()
            if width >= 1024:
                assert row.locator("..").evaluate("el => getComputedStyle(el).gridTemplateColumns.split(' ').length") >= 4
            for label in ["Connections" if locale == "en" else "Подключения", "Scenarios" if locale == "en" else "Сценарии"]:
                trigger = row.get_by_role("link", name=label, exact=True)
                trigger.hover()
                expect(page.get_by_role("tooltip")).to_have_text(label + ": 0")
                page.mouse.move(0, 0)
                trigger.focus()
                expect(page.get_by_role("tooltip")).to_have_text(label + ": 0")
                page.keyboard.press("Escape")
            assert row.bounding_box()["width"] < 260
            assert row.bounding_box()["height"] < 260
            href = identity.get_attribute("href")
            row.click(position={"x": 8, "y": 80})
            expect(page).to_have_url(base + href)
            page.go_back()
            expect(row).to_be_visible()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            menu = row.get_by_role("button", name="Actions" if locale == "en" else "Действия")
            menu.click()
            expect(page.get_by_role("menuitem", name="Edit" if locale == "en" else "Изменить", exact=True)).to_be_visible()
            # Wait for Radix's deferred outside-pointer listener after opening.
            page.wait_for_timeout(200)
            page.mouse.click(width / 2, 700)
            expect(page.get_by_role("menu")).not_to_be_visible()
            assert not menu.evaluate("el => el.matches(':focus-visible')")
            assert not row.evaluate("el => el.matches(':has(:focus-visible)')")
            menu.focus()
            page.keyboard.press("Enter")
            expect(page.get_by_role("menu")).to_be_visible()
            page.keyboard.press("Escape")
            expect(menu).to_be_focused()
            assert menu.evaluate("el => el.matches(':focus-visible')")
            menu.click()
            page.get_by_role("menuitem", name="Delete" if locale == "en" else "Удалить", exact=True).click()
            expect(page.get_by_role("alertdialog")).to_contain_text("Delete this profile?" if locale == "en" else "Удалить этот профиль?")
            page.get_by_role("button", name="Cancel" if locale == "en" else "Отмена", exact=True).click()
            page.keyboard.press("Escape")
            expect(row).to_be_visible()
            page.screenshot(path=f"/tmp/peek-profile-hierarchy-{locale}-{width}.png", full_page=True)
    # Counts include only the resources assigned to this profile.
    def connection_fixture(route):
        response = route.fetch()
        data = response.json()
        data["connections"] = [{"id": "calendar", "profileId": profile_id, "name": "Family calendar for school and weekend activities", "iconDataUrl": None}]
        data["scenarios"] = [{"id": str(i), "profileId": profile_id} for i in range(3)] + [{"id": "other", "profileId": "shared"}]
        route.fulfill(response=response, json=data)
    page.route("**/api/settings", connection_fixture)
    page.set_viewport_size({"width": 390, "height": 844})
    page.reload()
    expect(row.get_by_label("Connections", exact=True)).to_have_text("1")
    expect(row.get_by_label("Scenarios", exact=True)).to_have_text("3")
    expect(row.get_by_text("Family calendar for school and weekend activities", exact=True)).to_have_count(0)
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    row.get_by_role("link", name=name).focus()
    page.keyboard.press("Enter")
    expect(page).to_have_url(base + "/profiles/" + profile_id)
    page.go_back()
    page.screenshot(path="/tmp/peek-profile-card-connection.png", full_page=True)
    page.unroute("**/api/settings", connection_fixture)
    # Failed deletion keeps the row and explains the failure.
    def fail_delete(route):
        if route.request.method == "POST":
            route.fulfill(status=400, json={"error": "profile-in-use"})
        else:
            route.continue_()
    page.route("**/api/settings", fail_delete)
    row.get_by_role("button", name="Actions").click()
    page.get_by_role("menuitem", name="Delete", exact=True).click()
    page.get_by_role("alertdialog").get_by_role("button", name="Delete", exact=True).click()
    expect(page.get_by_role("alertdialog")).not_to_be_visible()
    page.keyboard.press("Escape")
    expect(page.get_by_role("status")).to_be_visible()
    expect(row).to_be_visible()
    page.keyboard.press("Escape")
    page.unroute("**/api/settings", fail_delete)
    row.get_by_role("button", name="Actions").click()
    page.get_by_role("menuitem", name="Delete", exact=True).click()
    page.get_by_role("alertdialog").get_by_role("button", name="Delete", exact=True).click()
    expect(row).to_have_count(0)
    shared = page.locator('[data-variant="profile"]').filter(has_text="Shared")
    shared.get_by_role("button", name="Actions").click()
    expect(page.get_by_role("menuitem", name="Delete", exact=True)).to_be_disabled()
    browser.close()
    print("PASS: profile hierarchy, locales, themes, confirmation, deletion errors and system protection")
