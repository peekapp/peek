"""Seed helpers/scenario-connections.ts with an isolated DB; run against that server.
uv run --with playwright python tests/scenario_connections_ui.py http://127.0.0.1:3219
"""
import sys
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1].rstrip('/')
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1280, 'height': 1000})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    def status(): return context.request.get(base + '/api/extensions').json()
    def visit(id):
        page.goto(base + '/scenarios/' + id)
        page.wait_for_load_state('networkidle')
    def prefs(locale, theme):
        for action, value in [('locale', locale), ('theme', theme)]:
            r = context.request.post(base + '/api/settings', headers={'Origin': base}, data={'action': action, action: value})
            assert r.ok, r.text()
    def group(): return page.locator('[data-setting="bindings:events"]')
    def sheet(): return page.get_by_role('dialog')
    prefs('en', 'night')
    scenario = next(i for i in status()['instances'] if i['package_id'] == 'test/single')
    page.goto(base + '/scenarios'); page.wait_for_load_state('networkidle')
    page.get_by_role('link', name=scenario['name'], exact=True).click()
    page.wait_for_load_state('networkidle')
    expect(group()).to_be_visible()
    # Order, optional radios, paused selection and saving only the binding group.
    assert page.locator('[data-setting]').evaluate_all('(nodes) => nodes.map(n => n.dataset.setting)')[:2] == ['general', 'bindings:events']
    expect(group().get_by_role('radio', name='None', exact=True)).to_be_checked()
    expect(group().get_by_role('radio', name='Calendar', exact=True).nth(1)).to_be_disabled()
    page.get_by_role('textbox', name='Name', exact=True).fill('Pending scenario name')
    choice = group().locator('[data-connection-choice]').first
    choice.click(position={'x': 4, 'y': 4})
    expect(group().get_by_role('radio', name='Calendar', exact=True).first).to_be_checked()
    expect(group().locator('[data-slot=card-footer]').get_by_role('button', name='Save', exact=True)).to_be_visible()
    group().get_by_role('button', name='Save', exact=True).click()
    expect(group().get_by_text('Saved', exact=True)).to_be_visible()
    assert next(i for i in status()['instances'] if i['id'] == scenario['id'])['name'] == scenario['name']
    expect(page.get_by_role('textbox', name='Name', exact=True)).to_have_value('Pending scenario name')
    # Sheet edits have an independent discard guard and save target.
    group().get_by_role('button', name='Open: Calendar', exact=True).first.click()
    assert sheet().evaluate('(e) => getComputedStyle(e).animationName') != 'none'
    assert page.locator('[data-slot=sheet-overlay]').evaluate('(e) => getComputedStyle(e).backdropFilter') != 'none'
    sheet().get_by_role('textbox', name='Name', exact=True).fill('Updated calendar')
    page.evaluate('history.back()')
    expect(page.get_by_role('alertdialog')).to_have_count(1)
    page.get_by_role('button', name='Keep editing', exact=True).click()
    sheet().get_by_role('button', name='Close', exact=True).click()
    expect(page.get_by_role('alertdialog')).to_have_count(1)
    page.get_by_role('button', name='Keep editing', exact=True).click()
    expect(sheet().get_by_role('textbox', name='Name', exact=True)).to_have_value('Updated calendar')
    sheet().locator('[data-setting="general"]').get_by_role('button', name='Save', exact=True).click()
    expect(sheet().get_by_text('Saved', exact=True)).to_be_visible()
    sheet().get_by_role('button', name='Close', exact=True).click()
    expect(page.locator('[data-slot=sheet-content]')).to_have_attribute('data-state', 'closed')
    expect(sheet()).to_have_count(0)
    expect(group().get_by_role('button', name='Open: Updated calendar', exact=True)).to_be_focused()
    expect(page.get_by_role('textbox', name='Name', exact=True)).to_have_value('Pending scenario name')
    # Creation refresh fails once after POST; retry must not POST a second time.
    page.get_by_role('button', name='+ Add connection', exact=True).click()
    expect(sheet().get_by_role('button', name='Single optional source')).to_have_count(0)
    sheet().get_by_role('button', name='iCalendar Read events', exact=False).click()
    sheet().get_by_role('textbox', name='Name', exact=True).fill('Created in sheet')
    sheet().get_by_role('textbox', name='Calendar URL (HTTPS)', exact=True).fill('https://example.com/calendar.ics')
    attempts = {'posts': 0, 'fail': False}
    def intercept(route):
        if route.request.method == 'POST':
            attempts['posts'] += 1
            response = route.fetch()
            attempts['fail'] = True
            route.fulfill(response=response)
        elif attempts['fail']:
            attempts['fail'] = False
            route.fulfill(status=503, json={'error':'unavailable'})
        else: route.continue_()
    page.route('**/api/extensions', intercept)
    sheet().get_by_role('button', name='Create', exact=True).click()
    expect(sheet().get_by_text('Connection saved, but its details could not be refreshed. Reload to continue.', exact=True)).to_be_visible()
    expect(sheet().get_by_role('button', name='Create', exact=True)).to_have_count(0)
    sheet().get_by_role('button', name='Reload', exact=True).click()
    expect(sheet()).to_have_count(0)
    assert attempts['posts'] == 1
    page.unroute('**/api/extensions', intercept)
    expect(group().get_by_role('radio', name='Created in sheet', exact=True)).to_be_checked()
    stored = next(i for i in status()['instances'] if i['id'] == scenario['id'])
    assert stored['name'] == scenario['name']
    created = next(i for i in status()['instances'] if i['name'] == 'Created in sheet')
    assert not any(b['connectionId'] == created['id'] for b in stored['bindings'].get('events', []))
    # Ambiguous datasets stay in the sheet until explicitly chosen.
    page.get_by_role('button', name='+ Add connection', exact=True).click()
    sheet().get_by_role('button', name='Two calendar datasets', exact=False).click()
    sheet().get_by_role('textbox', name='Name', exact=True).fill('Ambiguous calendar')
    sheet().get_by_role('textbox', name='Calendar URL (HTTPS)', exact=True).fill('https://example.com/calendar.ics')
    sheet().get_by_role('button', name='Create', exact=True).click()
    expect(sheet().get_by_text('Choose a dataset', exact=True)).to_be_visible()
    sheet().get_by_role('button', name='second', exact=True).click()
    expect(sheet()).to_have_count(0)
    expect(group().get_by_role('radio', name='Ambiguous calendar (second)', exact=True)).to_be_checked()
    # A dirty creation sheet can be backed out of without discarding the scenario.
    page.get_by_role('button', name='+ Add connection', exact=True).click()
    sheet().get_by_role('button', name='iCalendar Read events', exact=False).click()
    sheet().get_by_role('textbox', name='Name', exact=True).fill('Discard me')
    sheet().get_by_role('button', name='Back to connection types', exact=True).click()
    page.get_by_role('button', name='Leave', exact=True).click()
    expect(sheet().get_by_role('button', name='Two calendar datasets', exact=False)).to_be_visible()
    sheet().get_by_role('button', name='Close', exact=True).click()
    expect(page.get_by_role('textbox', name='Name', exact=True)).to_have_value('Pending scenario name')
    # Multi-input groups save independently and optional inputs can be cleared.
    page.reload(); page.wait_for_load_state('networkidle')
    grouped = next(i for i in status()['instances'] if i['package_id'] == 'test/grouped')
    visit(grouped['id'])
    group().get_by_role('radio', name='Updated calendar', exact=True).click()
    other = page.locator('[data-setting="bindings:other"]')
    other.get_by_role('radio', name='Created in sheet', exact=True).click()
    group().get_by_role('button', name='Save', exact=True).click()
    expect(group().get_by_text('Saved', exact=True)).to_be_visible()
    stored = next(i for i in status()['instances'] if i['id'] == grouped['id'])
    assert stored['bindings']['events'] and not stored['bindings'].get('other')
    expect(other.get_by_role('radio', name='Created in sheet', exact=True)).to_be_checked()
    group().get_by_role('radio', name='None', exact=True).click()
    group().get_by_role('button', name='Save', exact=True).click()
    expect(group().get_by_text('Saved', exact=True)).to_be_visible()
    assert not next(i for i in status()['instances'] if i['id'] == grouped['id'])['bindings']['events']
    # Multiple selections preserve the existing source; creation has only one Create action.
    page.reload(); page.wait_for_load_state('networkidle')
    multiple = next(i for i in status()['instances'] if i['package_id'] == 'peek/meetings')
    visit(multiple['id'])
    choice = group().locator('[data-connection-choice]').filter(has=page.get_by_role('checkbox', name='Created in sheet', exact=True))
    choice.locator('label').click()
    expect(choice.get_by_role('checkbox')).to_be_checked()
    choice.click(position={'x': 4, 'y': 4})
    expect(choice.get_by_role('checkbox')).not_to_be_checked()
    choice.get_by_role('checkbox').focus()
    page.keyboard.press('Space')
    expect(choice.get_by_role('checkbox')).to_be_checked()
    expect(group().get_by_role('checkbox', name='Updated calendar', exact=True)).to_be_checked()
    group().get_by_role('button', name='Save', exact=True).click()
    expect(group().get_by_text('Saved', exact=True)).to_be_visible()
    assert len(next(i for i in status()['instances'] if i['id'] == multiple['id'])['bindings']['events']) == 2
    visit('new?package=peek%2Fmeetings')
    expect(page.get_by_role('button', name='Create', exact=True)).to_be_disabled()
    expect(page.get_by_role('button', name='Save', exact=True)).to_have_count(0)
    page.get_by_role('button', name='+ Add connection', exact=True).click()
    sheet().get_by_role('button', name='iCalendar Read events', exact=False).click()
    sheet().get_by_role('textbox', name='Name', exact=True).fill('New scenario source')
    sheet().get_by_role('textbox', name='Calendar URL (HTTPS)', exact=True).fill('https://example.com/calendar.ics')
    page.route('**/api/extensions', lambda route: route.fulfill(status=400, json={'error':'Test save failed'}) if route.request.method == 'POST' else route.continue_())
    sheet().get_by_role('button', name='Create', exact=True).click()
    expect(sheet().get_by_text('Test save failed', exact=True)).to_be_visible()
    expect(sheet().get_by_role('textbox', name='Name', exact=True)).to_have_value('New scenario source')
    page.unroute('**/api/extensions')
    pending = []
    page.route('**/api/extensions', lambda route: pending.append(route) if route.request.method == 'POST' else route.continue_())
    sheet().get_by_role('button', name='Create', exact=True).click()
    expect(sheet().get_by_role('button', name='Saving…', exact=True)).to_be_disabled()
    sheet().get_by_role('button', name='Close', exact=True).click()
    page.keyboard.press('Escape')
    expect(sheet()).to_be_visible()
    assert len(pending) == 1
    pending[0].continue_()
    expect(sheet()).to_have_count(0)
    page.unroute('**/api/extensions')
    expect(group().get_by_role('checkbox', name='New scenario source', exact=True)).to_be_checked()
    expect(page.get_by_role('button', name='Create', exact=True)).to_be_enabled()
    page.reload(); page.wait_for_load_state('networkidle')
    empty = next(i for i in status()['instances'] if i['package_id'] == 'test/empty')
    visit(empty['id'])
    expect(group().get_by_text('No compatible connections', exact=True)).to_be_visible()
    page.get_by_role('button', name='+ Add connection', exact=True).click()
    expect(sheet().get_by_text('Install a compatible connection extension to continue.', exact=True)).to_be_visible()
    sheet().get_by_role('button', name='Close', exact=True).click()
    visit(scenario['id'])
    # Mobile, locales/themes, long names, sheets and overflow.
    page.reload(); page.wait_for_load_state('networkidle')
    for locale, theme in [('en', 'night'), ('ru', 'day')]:
        prefs(locale, theme)
        for width in [1280, 390]:
            page.set_viewport_size({'width':width, 'height':1000})
            page.reload(); page.wait_for_load_state('networkidle')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=f'/tmp/peek-connections-{locale}-{width}.png', full_page=True)
            group().get_by_role('button', name=('Open' if locale == 'en' else 'Открыть') + ': Updated calendar', exact=True).click()
            expect(sheet()).to_be_visible()
            sheet().get_by_role('textbox').first.fill('A very long connection name ' * 3)
            assert sheet().evaluate('(e) => e.scrollWidth <= e.clientWidth')
            page.wait_for_function("() => { const r = document.querySelector('[data-slot=sheet-content]').getBoundingClientRect(); return Math.abs(r.right - innerWidth) < 1; }")
            page.screenshot(path=f'/tmp/peek-connections-sheet-{locale}-{width}.png')
            page.reload(); page.wait_for_load_state('networkidle')
    # Reduced motion still dismisses the retained sheet and restores its trigger.
    page.emulate_media(reduced_motion='reduce')
    group().get_by_role('button', name='Открыть: Updated calendar', exact=True).click()
    expect(sheet()).to_be_visible()
    assert sheet().evaluate('(e) => parseFloat(getComputedStyle(e).animationDuration)') < .01
    sheet().get_by_role('button', name='Закрыть', exact=True).click()
    expect(sheet()).to_have_count(0)
    assert not errors, errors
    browser.close()
    print('Scenario connection sheet checks passed')
