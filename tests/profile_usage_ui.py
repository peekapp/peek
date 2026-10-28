"""Run against an isolated database: uv run --with playwright python tests/profile_usage_ui.py URL."""
import sys
import base64
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1].rstrip("/")
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context()
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    def post(body):
        response = context.request.post(base + "/api/settings", headers={"Origin": base}, data=body)
        assert response.ok, response.text()
        return response.json()
    for profile in context.request.get(base + "/api/settings").json()["profiles"]:
        if profile["name"] in ["Usage test profile", "Unused test profile"]:
            post({"action": "profile-delete", "id": profile["id"]})
    profile_id = post({"action": "profile-save", "config": {"name": "Usage test profile", "color": "blue"}})["id"]
    other_id = post({"action": "profile-save", "config": {"name": "Unused test profile", "color": "red"}})["id"]
    icon = "data:image/svg+xml;base64," + base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="orange"/></svg>').decode()
    # Saved-resource fixtures exercise ownership filtering without requiring a runner.
    def resources(route):
        response = route.fetch()
        data = response.json()
        data["screens"] = [
            {"id": "all", "name": "All profiles screen", "allProfiles": True, "profileIds": [], "theme": "inherit", "scale": 1},
            {"id": "selected", "name": "Selected profile screen", "allProfiles": False, "profileIds": [profile_id], "theme": "inherit", "scale": 1},
            {"id": "other", "name": "Other profile screen", "allProfiles": False, "profileIds": ["elsewhere"], "theme": "inherit", "scale": 1},
        ]
        data["scenarios"] = [{"id": "scenario", "name": "Paused scenario", "profileId": profile_id, "iconDataUrl": icon, "iconColor": "theme"}]
        data["connections"] = [{"id": "connection", "name": "Saved connection", "profileId": profile_id, "iconDataUrl": icon, "iconColor": "original"}]
        route.fulfill(response=response, json=data)
    page.route("**/api/settings", resources)
    for locale, theme in [("en", "night"), ("ru", "day")]:
        post({"action": "locale", "locale": locale})
        post({"action": "theme", "theme": theme})
        for width in [390, 1280]:
            page.set_viewport_size({"width": width, "height": 844})
            page.goto(base + "/profiles")
            page.wait_for_load_state("networkidle")
            card = page.locator('[data-variant="profile"]').filter(has_text="Usage test profile")
            expect(card.get_by_role("button", name=("Screens" if locale == "en" else "Экраны") + ": 2", exact=True)).to_be_visible()
            count = card.get_by_role("button", name=("Screens" if locale == "en" else "Экраны") + ": 2", exact=True)
            assert count.evaluate("el => getComputedStyle(el).paddingLeft") == "0px"
            assert count.evaluate("el => getComputedStyle(el).paddingRight") == "0px"
            count.focus()
            expect(page.get_by_role("tooltip")).to_have_text("Screens" if locale == "en" else "Экраны")
            count.click()
            expect(page.get_by_role("dialog").get_by_role("link")).to_have_count(4)
            expect(page).to_have_url(base + "/profiles")
            page.get_by_role("dialog").screenshot(path=f"/tmp/peek-related-from-card-{locale}-{width}.png")
            page.keyboard.press("Escape")
            expect(page.get_by_role("dialog")).not_to_be_visible()
            expect(count).to_be_focused()
            card.get_by_role("button", name="Actions" if locale == "en" else "Действия", exact=True).click()
            page.get_by_role("menuitem", name="Related items" if locale == "en" else "Связанные объекты", exact=True).click()
            expect(page.get_by_role("dialog").get_by_role("link")).to_have_count(4)
            page.get_by_role("dialog").get_by_role("button", name="Close" if locale == "en" else "Закрыть", exact=True).click()
            expect(page.get_by_role("dialog")).not_to_be_visible()
            page.keyboard.press("Escape")
            expect(page.get_by_role("menu")).not_to_be_visible()
            card.get_by_role("link", name="Usage test profile", exact=True).click()
            page.wait_for_load_state("networkidle")
            usage = page.get_by_role("button", name="Related items" if locale == "en" else "Связанные объекты", exact=True)
            usage.click()
            sheet = page.get_by_role("dialog")
            expect(sheet.get_by_role("link")).to_have_count(4)
            expect(sheet.get_by_role("link", name="All profiles screen")).to_have_attribute("href", "/screens/all/edit")
            expect(sheet.get_by_role("link", name="Paused scenario")).to_have_attribute("href", "/scenarios/scenario")
            expect(sheet.get_by_role("link", name="Saved connection")).to_have_attribute("href", "/connections/connection")
            expect(sheet.get_by_text("Other profile screen")).to_have_count(0)
            expect(sheet.locator("h2 svg")).to_have_count(0)
            for name, color in [("Paused scenario", "theme"), ("Saved connection", "original")]:
                resource = sheet.get_by_role("listitem").filter(has_text=name)
                expect(resource.locator("img")).to_have_attribute("src", icon)
                expect(resource.locator("[data-icon-color]")).to_have_attribute("data-icon-color", color)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            sheet.screenshot(path=f"/tmp/peek-profile-usage-{locale}-{width}.png")
            page.keyboard.press("Escape")
            expect(sheet).not_to_be_visible()
            expect(usage).to_be_focused()
            menu = page.get_by_role("button", name="Actions" if locale == "en" else "Действия", exact=True)
            assert usage.bounding_box()["x"] < menu.bounding_box()["x"]
            page.screenshot(path=f"/tmp/peek-profile-related-editor-{locale}-{width}.png")
            menu.click()
            page.get_by_role("menuitem", name="Related items" if locale == "en" else "Связанные объекты", exact=True).click()
            expect(page.get_by_role("dialog").get_by_role("link")).to_have_count(4)
            page.get_by_role("dialog").get_by_role("button", name="Close" if locale == "en" else "Закрыть", exact=True).click()
            expect(page.get_by_role("dialog")).not_to_be_visible()
            page.keyboard.press("Escape")
            expect(page.get_by_role("menu")).not_to_be_visible()
    # Opening and closing usage preserves a pending profile name edit.
    field = page.get_by_role("textbox")
    field.fill("Pending profile name")
    usage.click()
    resource_row = page.get_by_role("dialog").get_by_role("listitem").filter(has_text="Paused scenario")
    expect(resource_row.locator("img")).to_have_attribute("src", icon)
    # Clicking the padding, away from the name, must navigate through the draft guard.
    resource_row.click(position={"x": resource_row.bounding_box()["width"] - 12, "y": 12})
    expect(page.get_by_role("alertdialog")).to_be_visible()
    page.get_by_role("alertdialog").get_by_role("button", name="Остаться").click()
    expect(page.get_by_role("alertdialog")).not_to_be_visible()
    page.get_by_role("dialog").get_by_role("button", name="Закрыть").click()
    expect(page.get_by_role("dialog")).not_to_be_visible()
    expect(field).to_have_value("Pending profile name")
    # Screen-list identities navigate to their profile rather than the screen editor.
    page.goto(base + "/screens")
    page.wait_for_load_state("networkidle")
    profile_link = page.get_by_role("link", name="Usage test profile", exact=True)
    expect(profile_link).to_have_attribute("href", "/profiles/" + profile_id)
    profile_link.click()
    expect(page).to_have_url(base + "/profiles/" + profile_id)
    page.unroute("**/api/settings", resources)
    for screen in context.request.get(base + "/api/settings").json()["screens"]:
        post({"action": "screen-delete", "id": screen["id"]})
    page.goto(base + "/profiles/" + other_id)
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="Связанные объекты", exact=True).click()
    expect(page.get_by_role("dialog")).to_contain_text("С этим профилем пока ничего не связано")
    page.keyboard.press("Escape")
    page.goto(base + "/profiles/shared")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_role("button", name="Связанные объекты", exact=True)).to_be_visible()
    page.goto(base + "/profiles/new")
    expect(page.get_by_role("button", name="Связанные объекты", exact=True)).to_have_count(0)
    assert not errors, errors
    post({"action": "profile-delete", "id": profile_id})
    post({"action": "profile-delete", "id": other_id})
    browser.close()
    print("Profile usage, navigation, locales, layouts and draft guard passed")
