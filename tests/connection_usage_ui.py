"""Seed helpers/scenario-connections.ts into an isolated DB, then run against its server.
uv run --with playwright python tests/connection_usage_ui.py http://127.0.0.1:PORT
"""
import sys
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1].rstrip('/')
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 1000})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def post(path, data):
        response = context.request.post(base + path, headers={'Origin': base}, data=data)
        assert response.ok, response.text()
        return response.json()
    def status(): return context.request.get(base + '/api/extensions').json()
    def prefs(locale='en', theme='night'):
        for action, value in [('locale', locale), ('theme', theme)]:
            post('/api/settings', {'action': action, action: value})
    def visit(path):
        page.goto(base + path)
        page.wait_for_load_state('networkidle')
    def usage(root=None, locale='en'):
        return (root or page).get_by_role('region', name='Used by' if locale == 'en' else 'Используется в сценариях', exact=True)
    def no_overflow():
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), page.url
    prefs()
    data = status()
    source = next(i for i in data['instances'] if i['package_id'] == 'peek/meetings')
    connection_id = source['bindings']['events'][0]['connectionId']
    unused = next(i for i in data['instances'] if i['kind'] == 'connection' and i['id'] != connection_id)
    targets = []
    for name, enabled in [('Alpha scenario', True), ('Paused scenario', False), ('Long scenario ' + 'calendar' * 10, True), ('Бета', True), ('Январь', True)]:
        result = post('/api/extensions', {'action': 'save', 'instance': {
            'packageId': source['package_id'], 'name': name, 'profileId': source['profile_id'],
            'enabled': enabled, 'settings': source['settings'], 'bindings': source['bindings']}})
        targets.append(result['id'])
    total = 6
    visit('/connections')
    row = page.get_by_role('row').filter(has=page.locator(f'a[href="/connections/{connection_id}"]'))
    expect(row.get_by_text(f'{total} scenarios', exact=True)).to_be_visible()
    expect(page.get_by_text('0 scenarios', exact=True)).to_be_visible()
    count = row.get_by_text(f'{total} scenarios', exact=True)
    count.focus()
    expect(page.get_by_role('tooltip')).to_contain_text('including paused scenarios')
    page.get_by_role('searchbox').fill('Calendar')
    expect(row.get_by_text(f'{total} scenarios', exact=True)).to_be_visible()
    for locale in ['en', 'ru']:
        for theme in ['night', 'day']:
            prefs(locale, theme)
            for width in [1280, 390]:
                page.set_viewport_size({'width': width, 'height': 1000})
                visit('/connections')
                expect(page.get_by_text('6 scenarios' if locale == 'en' else '6 сценариев', exact=True)).to_be_visible()
                no_overflow()
                page.screenshot(path=f'/tmp/peek-usage-list-{locale}-{theme}-{width}.png', full_page=True)
                visit('/connections/' + connection_id)
                expect(usage(locale=locale).get_by_role('listitem')).to_have_count(total)
                names = usage(locale=locale).locator('a').all_text_contents()
                assert names == page.evaluate('(v) => [...v.names].sort((a,b) => a.localeCompare(b,v.locale))', {'names': names, 'locale': locale})
                no_overflow()
                page.screenshot(path=f'/tmp/peek-usage-header-{locale}-{theme}-{width}.png', full_page=True)
                usage(locale=locale).get_by_role('listitem').filter(has=page.get_by_role('link', name='Alpha scenario', exact=True)).get_by_role('button').click()
                warning_dialog = page.get_by_role('alertdialog')
                expect(warning_dialog.get_by_role('alert')).to_contain_text('This scenario will be disabled' if locale == 'en' else 'Сценарий будет выключен')
                no_overflow()
                page.screenshot(path=f'/tmp/peek-disable-warning-{locale}-{theme}-{width}.png', animations='disabled')
                warning_dialog.get_by_role('button', name='Cancel' if locale == 'en' else 'Отмена', exact=True).click()
    prefs()
    page.set_viewport_size({'width': 1280, 'height': 1000})
    visit('/connections/' + unused['id'])
    expect(usage().get_by_text('No scenarios use this connection yet.', exact=True)).to_be_visible()
    visit('/connections/' + connection_id)
    page.get_by_role('textbox', name='Name', exact=True).fill('Unsaved connection')
    link = usage().get_by_role('link', name='Alpha scenario', exact=True)
    link.focus()
    page.keyboard.press('Enter')
    expect(page.get_by_role('alertdialog')).to_be_visible()
    page.get_by_role('button', name='Keep editing', exact=True).click()
    expect(page.get_by_role('textbox', name='Name', exact=True)).to_have_value('Unsaved connection')
    link.click()
    page.get_by_role('button', name='Leave', exact=True).click()
    expect(page).to_have_url(base + '/scenarios/' + targets[0])
    # The active sheet guards both the underlying draft and its own draft.
    for dirty_connection in [False, True]:
        visit('/scenarios/' + source['id'])
        page.get_by_role('textbox', name='Name', exact=True).fill('Unsaved scenario')
        page.locator('[data-setting="bindings:events"]').get_by_role('button', name='Open: Calendar', exact=True).first.click()
        sheet = page.get_by_role('dialog')
        expect(usage(sheet).get_by_role('listitem')).to_have_count(total)
        if dirty_connection:
            sheet.get_by_role('textbox', name='Name', exact=True).fill('Unsaved sheet connection')
        usage(sheet).get_by_role('link', name='Alpha scenario', exact=True).click()
        expect(page.get_by_role('alertdialog')).to_have_count(1)
        page.get_by_role('button', name='Keep editing', exact=True).click()
        expect(sheet).to_be_visible()
        usage(sheet).get_by_role('link', name='Alpha scenario', exact=True).click()
        page.get_by_role('button', name='Leave', exact=True).click()
        expect(page).to_have_url(base + '/scenarios/' + targets[0])
    # Required last connections explain the problem and request disabling.
    visit('/connections/' + connection_id)
    page.get_by_role('button', name='Disconnect: Alpha scenario', exact=True).click()
    dialog = page.get_by_role('alertdialog')
    expect(dialog).to_contain_text('needs this connection to run')
    expect(dialog.get_by_role('button', name='Disable and disconnect', exact=True)).to_be_visible()
    dialog.get_by_role('button', name='Cancel', exact=True).click()
    expect(usage().get_by_role('listitem')).to_have_count(total)
    # Disconnecting from a sheet preserves unrelated drafts and cannot be restored by their next save.
    optional = next(i for i in status()['instances'] if i['package_id'] == 'test/single')
    post('/api/extensions', {'action': 'save', 'instance': {
        'id': optional['id'], 'packageId': optional['package_id'], 'name': optional['name'],
        'profileId': optional['profile_id'], 'enabled': True, 'settings': optional['settings'],
        'bindings': source['bindings']}})
    visit('/scenarios/' + optional['id'])
    page.get_by_role('textbox', name='Name', exact=True).fill('Pending optional scenario')
    page.locator('[data-setting="bindings:events"]').get_by_role('button', name='Open: Calendar', exact=True).first.click()
    sheet = page.get_by_role('dialog')
    button = sheet.get_by_role('button', name='Disconnect: ' + optional['name'], exact=True)
    # Immediate disconnect failures show a toast, keep the row and allow retry.
    page.route('**/api/extensions', lambda route: route.fulfill(status=400, json={'error': 'failed'}) if route.request.method == 'POST' else route.continue_())
    button.click()
    expect(page.get_by_role('alertdialog')).to_have_count(0)
    expect(page.locator('[data-sonner-toast][data-type="error"]')).to_be_visible()
    expect(button).to_be_enabled()
    page.unroute('**/api/extensions')
    button.click()
    expect(page.get_by_role('alertdialog')).to_have_count(0)
    expect(button).to_have_count(0)
    expect(page.get_by_text('Scenario disconnected', exact=True)).to_be_visible()
    page.locator('[data-sonner-toast]').filter(has_text='Scenario disconnected').last.get_by_role('button', name='Undo', exact=True).click()
    expect(button).to_be_visible()
    expect(page.get_by_text('Connection restored', exact=True)).to_be_visible()
    restored_optional = next(i for i in status()['instances'] if i['id'] == optional['id'])
    assert restored_optional['enabled'] == 1 and restored_optional['bindings'] == source['bindings']
    button.click()
    expect(button).to_have_count(0)
    sheet.get_by_role('button', name='Close', exact=True).click()
    expect(sheet).to_have_count(0)
    expect(page.get_by_role('textbox', name='Name', exact=True)).to_have_value('Pending optional scenario')
    expect(page.get_by_role('radio', name='None', exact=True)).to_be_checked()
    page.locator('[data-setting="general"]').get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_text('Saved', exact=True)).to_be_visible()
    stored = next(i for i in status()['instances'] if i['id'] == optional['id'])
    assert stored['enabled'] == 1 and stored['bindings']['events'] == [] and stored['name'] == 'Pending optional scenario'
    visit('/connections/' + connection_id)
    page.get_by_role('button', name='Disconnect: Alpha scenario', exact=True).click()
    page.get_by_role('alertdialog').get_by_role('button', name='Disable and disconnect', exact=True).click()
    expect(usage().get_by_role('listitem')).to_have_count(total - 1)
    page.locator('[data-sonner-toast]').filter(has_text='Scenario disconnected').last.get_by_role('button', name='Undo', exact=True).click()
    expect(usage().get_by_role('listitem')).to_have_count(total)
    restored_enabled = next(i for i in status()['instances'] if i['id'] == targets[0])
    assert restored_enabled['enabled'] == 1 and restored_enabled['bindings']['events']
    page.get_by_role('button', name='Disconnect: Alpha scenario', exact=True).click()
    page.get_by_role('alertdialog').get_by_role('button', name='Disable and disconnect', exact=True).click()
    expect(usage().get_by_role('listitem')).to_have_count(total - 1)
    disabled = next(i for i in status()['instances'] if i['id'] == targets[0])
    assert disabled['enabled'] == 0 and disabled['bindings']['events'] == []
    visit('/scenarios/' + targets[0])
    general = page.locator('[data-setting="general"]')
    expect(general.get_by_role('switch')).not_to_be_checked()
    general.get_by_role('switch').check()
    general.get_by_role('button', name='Save', exact=True).click()
    expect(general.get_by_role('alert').filter(has_text='compatible connection')).to_be_visible()
    assert next(i for i in status()['instances'] if i['id'] == targets[0])['enabled'] == 0
    # Save a replacement separately, then enable without losing that binding.
    bindings = page.locator('[data-setting="bindings:events"]')
    bindings.get_by_role('checkbox', name='Calendar', exact=True).first.check()
    bindings.get_by_role('button', name='Save', exact=True).click()
    expect(page.get_by_text('Saved', exact=True)).to_be_visible()
    general.get_by_role('button', name='Save', exact=True).click()
    expect(general.get_by_role('button', name='Save', exact=True)).to_be_disabled()
    restored = next(i for i in status()['instances'] if i['id'] == targets[0])
    assert restored['enabled'] == 1 and restored['bindings']['events']
    # Already disabled scenarios also disconnect immediately and stay disabled.
    visit('/connections/' + connection_id)
    paused_button = page.get_by_role('button', name='Disconnect: Paused scenario', exact=True)
    paused_button.click()
    expect(page.get_by_role('alertdialog')).to_have_count(0)
    expect(paused_button).to_have_count(0)
    paused = next(i for i in status()['instances'] if i['name'] == 'Paused scenario')
    assert paused['enabled'] == 0 and paused['bindings']['events'] == []
    assert len(context.pages) == 1
    assert not errors, errors
    browser.close()
print('Connection usage browser checks passed')
