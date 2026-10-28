"""SDK controls browser checks. Seed tests/helpers/settings-ui.ts into an isolated database first.
Run: uv run --with playwright python tests/settings_ui.py http://127.0.0.1:PORT
"""
import sys
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1].rstrip('/')
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 1000}, permissions=['clipboard-read', 'clipboard-write'])
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    def prefs(locale='en', theme='night'):
        for action, value in [('locale', locale), ('theme', theme)]:
            r = context.request.post(base + '/api/settings', headers={'Origin': base}, data={'action': action, action: value})
            assert r.ok, r.text()
    def saved_toast():
        notification = page.locator('[data-sonner-toast]').filter(has_text='Saved').last
        expect(notification).to_be_visible()
        notification.get_by_role('button', name='Dismiss notification').click()
        expect(notification).to_have_count(0)
    def status(): return context.request.get(base + '/api/extensions').json()
    def block(id): return page.locator(f'[data-setting="block:{id}"]')
    def visit(path):
        page.goto(base + path)
        page.wait_for_load_state('networkidle')
    def no_overflow():
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), page.url
    prefs()
    data = status()
    connection = next(i for i in data['instances'] if i['package_id'] == 'test/settings')
    scenario = next(i for i in data['instances'] if i['package_id'] == 'test/settings-scenario')
    visit('/connections/' + connection['id'])
    assert 'never-return-this-token' not in page.content()
    expect(page.get_by_role('heading', name='Calendar behavior')).to_be_visible()
    expect(block('help').get_by_role('button', name='Save', exact=True)).to_have_count(0)
    expect(block('help').locator('[data-slot="card-content"]')).to_have_count(0)
    expect(block('identity').get_by_role('button', name='Save', exact=True)).to_have_count(0)
    expect(block('locked').get_by_role('switch')).to_be_disabled()
    page.get_by_role('button', name='Copy value', exact=True).click()
    expect(page.get_by_text('Copied', exact=True)).to_be_visible()
    assert page.evaluate('navigator.clipboard.readText()') == 'instance-123'
    # Grouped save excludes a separate pending block.
    page.get_by_role('textbox', name='Notes', exact=True).fill('Pending notes')
    page.get_by_role('textbox', name='Slug', exact=True).fill('BAD VALUE')
    block('general').get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_text('Use the requested format.', exact=True)).to_be_visible()
    page.get_by_role('textbox', name='Slug', exact=True).fill('my-calendar')
    page.get_by_role('spinbutton', name='Count', exact=True).fill('4')
    block('general').get_by_role('switch').focus()
    page.keyboard.press('Space')
    block('general').get_by_role('button', name='Save', exact=True).click()
    saved_toast()
    stored = next(i for i in status()['instances'] if i['id'] == connection['id'])
    assert stored['settings']['slug'] == 'my-calendar' and stored['settings']['count'] == 4 and stored['settings']['enabled'] is False
    assert 'notes' not in stored['settings']
    expect(page.get_by_role('textbox', name='Notes', exact=True)).to_have_value('Pending notes')
    # Guard cancellation preserves the draft.
    page.get_by_role('link', name='Scenarios', exact=True).click()
    expect(page.get_by_role('alertdialog')).to_be_visible()
    page.get_by_role('button', name='Keep editing', exact=True).click()
    expect(page.get_by_role('textbox', name='Notes', exact=True)).to_have_value('Pending notes')
    # Failed requests retain values; retry commits only this block.
    page.route('**/api/extensions', lambda route: route.fulfill(status=400, json={'error':'schema-validation-failed', 'issues':[{'path':'settings/notes','code':'maxLength'}]}) if route.request.method == 'POST' else route.continue_())
    block('notes').get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_text('The text length is outside the allowed range.', exact=True)).to_be_visible()
    expect(page.get_by_role('textbox', name='Notes', exact=True)).to_have_value('Pending notes')
    page.unroute('**/api/extensions')
    block('notes').get_by_role('button', name='Save', exact=True).click()
    saved_toast()
    page.get_by_role('combobox', name='Mode', exact=True).click()
    page.get_by_role('option', name='Two', exact=True).click()
    page.get_by_role('radio', name='Queue', exact=True).focus()
    page.keyboard.press('ArrowRight', delay=50)
    expect(page.get_by_role('radio', name='Immediate', exact=True)).to_be_checked()
    block('choices').get_by_role('button', name='Save', exact=True).click()
    saved_toast()
    stored = next(i for i in status()['instances'] if i['id'] == connection['id'])
    assert stored['settings']['mode'] == 2 and stored['settings']['strategy'] == 'immediate'
    # Secret replacement has its own transaction and empties the browser draft.
    block('credentials').get_by_role('checkbox').check()
    block('credentials').locator('input[type=password]').fill('replacement-token')
    block('credentials').get_by_role('button', name='Save', exact=True).click()
    saved_toast()
    expect(block('credentials').locator('input[type=password]')).to_have_count(0)
    assert 'replacement-token' not in str(status())
    # Every locale/theme/viewport renders the same shared compositions.
    for locale in ['en', 'ru']:
        for theme in ['night', 'day']:
            prefs(locale, theme)
            for width in [1280, 390]:
                page.set_viewport_size({'width': width, 'height': 900})
                visit('/connections/' + connection['id'])
                no_overflow()
                page.screenshot(path=f'/tmp/peek-settings-{locale}-{theme}-{width}.png', full_page=True)
    prefs()
    page.set_viewport_size({'width':1280,'height':1000})
    visit('/scenarios/' + scenario['id'])
    expect(block('general').get_by_role('switch')).to_be_visible()
    expect(page.locator('[data-setting="general"]').get_by_role('switch')).to_be_visible()
    expect(block('credentials')).to_have_count(0)
    # Create validates the whole configuration and offers exactly one action.
    visit('/connections/new?package=test%2Fsettings')
    expect(page.get_by_role('button', name='Create', exact=True)).to_have_count(1)
    expect(page.get_by_role('button', name='Save', exact=True)).to_have_count(0)
    page.get_by_role('button', name='Create', exact=True).click()
    expect(page.get_by_text('This field is required.', exact=True)).to_be_visible()
    block('credentials').locator('input[type=password]').fill('new-token')
    page.get_by_role('button', name='Create', exact=True).click()
    page.wait_for_url(base + '/connections')
    expect(page.locator('[data-sonner-toast]').filter(has_text='Connection created')).to_be_visible()
    assert len(status()['instances']) == 3
    assert not errors, errors
    browser.close()
print('Settings SDK browser checks passed')
