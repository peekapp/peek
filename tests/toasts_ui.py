"""Seed helpers/scenario-connections.ts into an isolated database first.
uv run --with playwright python tests/toasts_ui.py http://127.0.0.1:PORT
"""
import sys
import uuid
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1].rstrip('/')
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1280, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    def post(body):
        response = context.request.post(base + '/api/settings', headers={'Origin':base}, data=body)
        assert response.ok, response.text()
        return response.json()
    def visit(path):
        page.goto(base + path)
        page.wait_for_load_state('networkidle')
    def notification(text, close='Dismiss notification'):
        toast = page.locator('[data-sonner-toast]')
        expect(toast).to_have_count(1)
        expect(toast).to_contain_text(text)
        expect(toast).to_be_visible()
        assert toast.evaluate('(e) => e.scrollWidth <= e.clientWidth')
        toast.get_by_role('button', name=close, exact=True).focus()
        page.keyboard.press('Enter')
        expect(toast).to_have_count(0)
    post({'action':'locale','locale':'en'})
    post({'action':'theme','theme':'night'})
    visit('/settings')
    page.get_by_role('combobox', name='Appearance theme', exact=True).click()
    page.get_by_role('option', name='Light', exact=True).click()
    notification('Theme saved')
    page.get_by_role('combobox', name='Language', exact=True).click()
    page.get_by_role('option', name='Русский', exact=True).click()
    notification('Язык сохранён', 'Закрыть уведомление')
    expect(page.locator('section[aria-live="polite"]')).to_have_attribute('aria-label', 'Уведомления alt+T')
    post({'action':'locale','locale':'en'})
    # Full-page creation navigates once and preserves the toast across routes.
    name = 'Toast scenario ' + uuid.uuid4().hex[:8]
    visit('/scenarios/new?package=test%2Fsingle')
    page.get_by_role('textbox', name='Name', exact=True).fill(name)
    page.get_by_role('button', name='Create', exact=True).click()
    expect(page).to_have_url(base + '/scenarios')
    notification('Scenario created')
    data = context.request.get(base + '/api/extensions').json()
    item = next(i for i in data['instances'] if i['name'] == name)
    visit('/scenarios/' + item['id'])
    identity = page.locator('[data-setting="general"]')
    page.get_by_role('textbox', name='Name', exact=True).fill(name + ' edited')
    # A successful POST followed by failed GET is still saved; no duplicate write.
    attempts = {'posts':0, 'fail':False}
    def refresh_failure(route):
        if route.request.method == 'POST':
            attempts['posts'] += 1
            response = route.fetch()
            attempts['fail'] = True
            route.fulfill(response=response)
        elif attempts['fail']:
            route.fulfill(status=503, json={'error':'unavailable'})
        else: route.continue_()
    page.route('**/api/extensions', refresh_failure)
    identity.get_by_role('button', name='Save', exact=True).click()
    notification('Saved')
    expect(identity.get_by_role('button', name='Save', exact=True)).to_be_disabled()
    expect(page).to_have_url(base + '/scenarios/' + item['id'])
    assert attempts['posts'] == 1
    page.unroute('**/api/extensions')
    # Failed save keeps the draft and has no success toast.
    page.get_by_role('textbox', name='Name', exact=True).fill(name + ' pending')
    page.route('**/api/extensions', lambda r: r.fulfill(status=400, json={'error':'Save failed'}) if r.request.method == 'POST' else r.continue_())
    identity.get_by_role('button', name='Save', exact=True).click()
    expect(identity.get_by_text('Save failed', exact=True)).to_be_visible()
    expect(page.locator('[data-sonner-toast]')).to_have_count(0)
    expect(page.get_by_role('textbox', name='Name', exact=True)).to_have_value(name + ' pending')
    page.unroute('**/api/extensions')
    visit('/scenarios')
    row = page.get_by_role('row').filter(has_text=name + ' edited')
    row.get_by_role('button', name='Actions', exact=True).click()
    page.get_by_role('menuitem', name='Disable', exact=True).click()
    notification('Scenario paused')
    row.get_by_role('button', name='Actions', exact=True).click()
    page.get_by_role('menuitem', name='Enable', exact=True).click()
    notification('Scenario enabled')
    # Runner availability is an isolated UI fixture; requests still hit the real API.
    def ready(route):
        response = route.fetch()
        if route.request.method == 'GET':
            data = response.json()
            data['runtime'] = {'ready':True, 'error':None}
            route.fulfill(response=response, json=data)
        else: route.fulfill(response=response)
    page.route('**/api/extensions', ready)
    visit('/scenarios')
    row.get_by_role('button', name='Actions', exact=True).click()
    page.get_by_role('menuitem', name='Refresh cards', exact=True).click()
    notification('Refresh requested')
    page.unroute('**/api/extensions')
    # Failed list deletion stays in the dialog; retry yields one success.
    row.get_by_role('button', name='Actions', exact=True).click()
    page.get_by_role('menuitem', name='Delete', exact=True).click()
    dialog = page.get_by_role('alertdialog')
    page.route('**/api/extensions', lambda r: r.fulfill(status=503, json={'error':'unavailable'}) if r.request.method == 'POST' else r.continue_())
    dialog.get_by_role('button', name='Delete', exact=True).click()
    expect(dialog.get_by_role('alert')).to_contain_text('Could not complete this action')
    expect(page.locator('[data-sonner-toast]')).to_have_count(0)
    page.unroute('**/api/extensions')
    dialog.get_by_role('button', name='Delete', exact=True).click()
    expect(dialog).to_have_count(0)
    notification('Scenario deleted')
    # Screen clipboard success/failure use the same surface, with no leaked values.
    screen_id = 'toast-' + uuid.uuid4().hex[:8]
    visit('/screens/new')
    page.get_by_label('Screen name', exact=True).fill('Toast screen')
    page.locator('#screen-id').fill(screen_id)
    page.get_by_role('button', name='Create', exact=True).click()
    expect(page).to_have_url(base + '/screens')
    notification('Screen created')
    visit('/screens/' + screen_id + '/edit')
    page.get_by_role('button', name='Copy link', exact=True).click()
    notification('Copied')
    page.evaluate("() => { navigator.clipboard.writeText = async () => { throw new Error('blocked'); }; }")
    page.get_by_role('button', name='Copy link', exact=True).click()
    notification('Could not copy')
    # Package UI requests are fixtures: no downloads, installation or rollback occur.
    fixture = context.request.get(base + '/api/extensions').json()
    fixture['canRollback'] = True
    fixture['instances'] = []
    fixture['connections'] = []
    fixture['packages'] = [fixture['packages'][0]]
    fixture['packages'][0]['unused'] = True
    review = {'id':'toast-review', 'packages':[{'manifest':fixture['packages'][0]['manifest'], 'sha256':'test', 'iconDataUrl':None}]}
    def package_api(route):
        if route.request.method == 'GET': route.fulfill(json=fixture)
        else:
            action = route.request.post_data_json['action']
            if action == 'delete-package': fixture['packages'] = []
            route.fulfill(json=review if action == 'download' else {'ok':True})
    page.route('**/api/extensions', package_api)
    visit('/settings/extensions')
    page.get_by_role('textbox', name='Release URL', exact=True).fill('https://example.com/package.peek')
    page.get_by_role('button', name='Review package', exact=True).click()
    notification('Package ready for review')
    page.get_by_role('button', name='Accept and install', exact=True).click()
    notification('Installation requested')
    page.get_by_role('button', name='Review package', exact=True).click()
    notification('Package ready for review')
    page.get_by_role('button', name='Cancel', exact=True).click()
    notification('Installation cancelled')
    page.get_by_role('button', name='Restore previous installation', exact=True).click()
    page.get_by_role('alertdialog').get_by_role('button', name='Restore previous installation', exact=True).click()
    notification('Previous installation restored')
    page.get_by_role('button', name='Delete', exact=True).click()
    page.get_by_role('alertdialog').get_by_role('button', name='Delete', exact=True).click()
    notification('Package deleted')
    page.unroute('**/api/extensions')
    # Both locales, palettes and viewport sizes use the same toast component.
    for locale in ['en','ru']:
        for theme in ['night','day']:
            post({'action':'locale','locale':locale})
            post({'action':'theme','theme':theme})
            for width in [1280,390]:
                page.set_viewport_size({'width':width,'height':900})
                visit('/profiles/new')
                page.get_by_role('textbox').fill('Toast profile')
                page.get_by_role('button', name='Create' if locale == 'en' else 'Создать', exact=True).click()
                expect(page).to_have_url(base + '/profiles')
                toast = page.locator('[data-sonner-toast]')
                expect(toast).to_be_visible()
                page.wait_for_function("() => { const r = document.querySelector('[data-sonner-toast]').getBoundingClientRect(); return r.top > 0 && r.bottom <= innerHeight - 15 && getComputedStyle(document.querySelector('[data-sonner-toast]')).opacity === '1'; }")
                page.screenshot(path=f'/tmp/peek-toast-{locale}-{theme}-{width}.png')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                notification('Profile created' if locale == 'en' else 'Профиль создан', 'Dismiss notification' if locale == 'en' else 'Закрыть уведомление')
    # Unfocused notifications dismiss automatically after five seconds.
    visit('/profiles/new')
    page.get_by_role('textbox').fill('Auto dismiss')
    page.get_by_role('button', name='Создать', exact=True).click()
    expect(page).to_have_url(base + '/profiles')
    expect(page.locator('[data-sonner-toast]')).to_be_visible()
    page.mouse.move(0, 0)
    expect(page.locator('[data-sonner-toast]')).to_have_count(0, timeout=7500)
    assert not errors, errors
    browser.close()
print('Action toast browser checks passed')
