"""Run against an isolated database seeded by helpers/scenario-connections.ts."""
import sys
import re
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1].rstrip('/')
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def post(path, data):
        response = page.request.post(base + path, headers={'Origin': base}, data=data)
        assert response.ok, response.text()
        return response.json()
    data = page.request.get(base + '/api/extensions').json()
    scenario = next(i for i in data['instances'] if i['package_id'] == 'peek/meetings')
    connection = scenario['bindings']['events'][0]['connectionId']
    def visit(path):
        page.goto(base + path)
        page.wait_for_load_state('networkidle')
    def open_related(root=None, locale='en'):
        trigger = (root or page).get_by_role('button', name='Actions' if locale == 'en' else 'Действия', exact=True)
        trigger.hover()
        trigger.focus()
        expect(page.get_by_role('tooltip')).to_have_count(0)
        trigger.click()
        page.get_by_role('menuitem', name='Related items' if locale == 'en' else 'Связанные объекты', exact=True).click()
        assert_initial_focus()
    def assert_initial_focus():
        page.mouse.move(0, 0)
        expect(sheet().locator('[data-slot=sheet-title]')).to_be_focused()
        expect(page.get_by_role('tooltip')).to_have_count(0)
    def sheet(): return page.get_by_role('dialog').last
    def close(label):
        sheet().get_by_role('button', name=label, exact=True).click()
        try:
            expect(page.get_by_role('dialog')).to_have_count(0)
        except AssertionError:
            print(page.locator('[role=dialog]').evaluate_all('(els) => els.map(el => ({state: el.dataset.state, text: el.innerText}))'), flush=True)
            raise
        if page.get_by_role('menu').count(): page.keyboard.press('Escape')
    cards = [dict(id=str(i), title='Card ' + str(i), body='Long body ' * 60, location='Room 1', targetAt=1800000000000+i,
                  visibleFrom=1799000000000, expiresAt=1801000000000, kind='info') for i in range(3)]
    url = '**/api/scenarios/' + scenario['id'] + '/cards'
    calls = []
    def response(route):
        calls.append(route.request.url)
        route.fulfill(json={'cards': cards, 'timeZone': 'Europe/Moscow'})
    page.route(url, response)
    for locale, theme, width in [('en','day',1280), ('en','night',390), ('ru','day',390), ('ru','night',1280)]:
        for action, value in [('locale',locale), ('theme',theme)]:
            post('/api/settings', {'action':action,action:value})
        page.set_viewport_size({'width':width, 'height':900})
        related = 'Related items' if locale == 'en' else 'Связанные объекты'
        actions = 'Actions' if locale == 'en' else 'Действия'
        close_label = 'Close' if locale == 'en' else 'Закрыть'
        for kind, id in [('scenarios',scenario['id']), ('connections',connection)]:
            print(locale, theme, width, kind, flush=True)
            visit('/'+kind)
            row = page.get_by_role('row').filter(has=page.locator(f'a[href="/{kind}/{id}"]'))
            count = row.get_by_role('button', name=re.compile(r'^\d+ (cards?|scenarios?|карточ|сценар)'))
            before = len(calls)
            count.click()
            assert_initial_focus()
            expect(sheet().get_by_role('listitem')).to_have_count(3 if kind == 'scenarios' else 1)
            expect(page).to_have_url(base+'/'+kind)
            if kind == 'scenarios': assert len(calls) > before
            close(close_label)
            expect(count).to_be_focused()
            row.get_by_role('button', name=actions, exact=True).click()
            page.get_by_role('menuitem', name=related, exact=True).click()
            expect(sheet().get_by_role('listitem')).to_have_count(3 if kind == 'scenarios' else 1)
            close(close_label)
            page.keyboard.press('Escape')
            visit('/'+kind+'/'+id)
            name = page.get_by_role('textbox', name='Name' if locale == 'en' else 'Название', exact=True)
            name.fill('Pending name')
            expect(page.get_by_role('button', name=related, exact=True)).to_have_count(0)
            button = page.get_by_role('button', name=actions, exact=True)
            open_related(locale=locale)
            expect(sheet().get_by_role('listitem')).to_have_count(3 if kind == 'scenarios' else 1)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            sheet().screenshot(path=f'/tmp/peek-related-{kind}-{locale}-{width}.png')
            close(close_label)
            expect(button).to_be_focused()
            expect(name).to_have_value('Pending name')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    post('/api/settings', {'action':'locale','locale':'en'})
    visit('/scenarios/'+scenario['id'])
    page.unroute(url)
    pending = []
    page.route(url, lambda route: pending.append(route))
    open_related()
    expect(sheet().get_by_text('Loading cards…', exact=True)).to_be_visible()
    close('Close')
    page.unroute(url)
    page.route(url, response)
    open_related()
    expect(sheet().get_by_role('listitem')).to_have_count(3)
    # A late response from the closed sheet must not replace the current request.
    for request in pending:
        try: request.fulfill(json={'cards':[], 'timeZone':'Europe/Moscow'})
        except Exception: pass  # The browser may already have cancelled the request.
    expect(sheet().get_by_role('listitem')).to_have_count(3)
    close('Close')
    page.unroute(url)
    page.route(url, lambda route: route.fulfill(status=503, json={'error':'cards-unavailable'}))
    open_related()
    expect(sheet().get_by_text('Could not load cards.', exact=True)).to_be_visible()
    page.unroute(url)
    page.route(url, lambda route: route.fulfill(json={'cards':[], 'timeZone':'Europe/Moscow'}))
    sheet().get_by_role('button', name='Reload', exact=True).click()
    expect(sheet().get_by_text('This scenario has no stored cards yet', exact=True)).to_be_visible()
    close('Close')
    # The nested sheet must leave both editor drafts intact on close.
    page.get_by_role('textbox', name='Name', exact=True).fill('Pending scenario')
    page.get_by_role('button', name='Open: Calendar', exact=True).first.click()
    editor = page.get_by_role('dialog').first
    editor.get_by_role('textbox', name='Name', exact=True).fill('Pending connection')
    open_related(editor)
    expect(sheet().get_by_role('listitem')).to_have_count(1)
    sheet().get_by_role('button', name='Close', exact=True).click()
    expect(page.get_by_role('dialog', name='Related items', exact=True)).to_have_count(0)
    page.keyboard.press('Escape')
    expect(editor.get_by_role('textbox', name='Name', exact=True)).to_have_value('Pending connection')
    assert not errors, errors
    browser.close()
print('Instance related items checks passed')
