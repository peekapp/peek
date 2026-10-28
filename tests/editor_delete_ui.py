"""Run with an isolated database seeded by helpers/scenario-connections.ts.
uv run --with playwright python tests/editor_delete_ui.py http://127.0.0.1:3219
"""
import sys
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1].rstrip('/')
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width':1280,'height':900})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    def status(): return context.request.get(base+'/api/extensions').json()
    def post(body):
        r = context.request.post(base+'/api/extensions', headers={'Origin':base}, data=body)
        assert r.ok, r.text()
        return r.json()
    def visit(path):
        page.goto(base+path); page.wait_for_load_state('networkidle')
    def menu(scope):
        scope.locator('[data-setting="general"]').get_by_role('button', name='Actions', exact=True).click()
        expect(page.get_by_role('menuitem', name='Edit', exact=True)).to_have_count(0)
        page.get_by_role('menuitem', name='Delete', exact=True).click()
        expect(page.get_by_role('alertdialog')).to_be_visible()
    context.request.post(base+'/api/settings', headers={'Origin':base}, data={'action':'locale','locale':'en'})
    data=status()
    scenario=next(i for i in data['instances'] if i['package_id']=='test/single')
    used=next(i for i in data['instances'] if i['package_id']=='peek/meetings')['bindings']['events'][0]['connectionId']
    created=post({'action':'save','instance':{'packageId':'peek/ical','name':'Disposable calendar','profileId':'shared','enabled':True,'settings':{'timeZone':'UTC','intervalSeconds':300},'secrets':{'url':'https://example.com/test.ics'},'bindings':{}}})['id']
    visit('/scenarios/'+scenario['id'])
    page.get_by_role('textbox', name='Name', exact=True).fill('Keep this draft')
    menu(page)
    page.get_by_role('alertdialog').get_by_role('button', name='Cancel', exact=True).click()
    expect(page.get_by_role('alertdialog')).to_have_count(0)
    page.keyboard.press('Escape')
    expect(page.get_by_role('menu')).to_have_count(0)
    expect(page.get_by_role('textbox', name='Name', exact=True)).to_have_value('Keep this draft')
    # Used connections remain protected; failed deletion stays in the confirmation.
    page.get_by_role('button', name='Open: Calendar', exact=True).first.click()
    sheet=page.get_by_role('dialog')
    menu(sheet)
    page.get_by_role('alertdialog').get_by_role('button', name='Delete', exact=True).click()
    expect(page.get_by_role('alertdialog').get_by_role('alert')).to_contain_text('This connection is used by a scenario')
    assert any(i['id']==used for i in status()['instances'])
    page.get_by_role('alertdialog').get_by_role('button', name='Cancel', exact=True).click()
    expect(page.get_by_role('alertdialog')).to_have_count(0)
    page.keyboard.press('Escape')
    expect(page.get_by_role('menu')).to_have_count(0)
    sheet.get_by_role('button', name='Close', exact=True).click()
    expect(sheet).to_have_count(0)
    # An unused connection selected only in the draft can be deleted without losing that draft.
    page.get_by_role('radio', name='Disposable calendar', exact=True).click()
    page.get_by_role('button', name='Open: Disposable calendar', exact=True).click()
    menu(sheet)
    page.route('**/api/extensions', lambda r: r.fulfill(status=503, json={'error':'unavailable'}) if r.request.method=='POST' else r.continue_())
    page.get_by_role('alertdialog').get_by_role('button', name='Delete', exact=True).click()
    expect(page.get_by_role('alertdialog').get_by_role('alert')).to_contain_text('Could not complete this action')
    page.unroute('**/api/extensions')
    page.get_by_role('alertdialog').get_by_role('button', name='Delete', exact=True).click()
    expect(sheet).to_have_count(0)
    expect(page.get_by_role('radio', name='Disposable calendar', exact=True)).to_have_count(0)
    expect(page.get_by_role('radio', name='None', exact=True)).to_be_checked()
    expect(page.get_by_role('button', name='+ Add connection', exact=True)).to_be_focused()
    expect(page.get_by_role('textbox', name='Name', exact=True)).to_have_value('Keep this draft')
    assert not any(i['id']==created for i in status()['instances'])
    # Deleting an existing scenario returns to its list even with an unsaved name.
    menu(page)
    page.get_by_role('alertdialog').get_by_role('button', name='Delete', exact=True).click()
    page.wait_for_url(base+'/scenarios')
    assert not any(i['id']==scenario['id'] for i in status()['instances'])
    # New instances do not have a delete action.
    visit('/connections/new?package=peek%2Fical')
    expect(page.get_by_role('button', name='Actions', exact=True)).to_have_count(0)
    # Standalone connection editor also returns to the correct list.
    unused=next(i for i in status()['instances'] if i['kind']=='connection' and not i['enabled'])
    visit('/connections/'+unused['id']);menu(page)
    page.get_by_role('alertdialog').get_by_role('button', name='Delete', exact=True).click()
    page.wait_for_url(base+'/connections')
    assert not any(i['id']==unused['id'] for i in status()['instances'])
    assert not errors, errors
    browser.close()
    print('Editor deletion checks passed: cancel, in-use protection, failure/retry, draft retention and redirects.')
