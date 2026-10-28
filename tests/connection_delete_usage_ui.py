"""Run against an isolated database seeded by helpers/scenario-connections.ts."""
import sys
from playwright.sync_api import sync_playwright, expect
base=sys.argv[1].rstrip('/')
with sync_playwright() as p:
    browser=p.chromium.launch()
    page=browser.new_page(viewport={'width':1280,'height':1000})
    errors=[]
    page.on('pageerror', lambda error: errors.append(str(error)))
    def status(): return page.request.get(base+'/api/extensions').json()
    def post(path, body):
        response=page.request.post(base+path,headers={'Origin':base},data=body)
        assert response.ok, response.text()
        return response.json()
    def prefs(locale, theme):
        for action,value in [('locale',locale),('theme',theme)]:
            post('/api/settings', {'action':action,action:value})
    def visit(path):
        page.goto(base+path)
        page.wait_for_load_state('networkidle')
    prefs('en','day')
    data=status()
    scenario=next(i for i in data['instances'] if i['package_id']=='peek/meetings')
    cid=scenario['bindings']['events'][0]['connectionId']
    optional=next(i for i in data['instances'] if i['package_id']=='test/single')
    post('/api/extensions', {'action':'save','instance':{'id':optional['id'],'packageId':optional['package_id'],'name':optional['name'],'profileId':optional['profile_id'],'enabled':True,'settings':optional['settings'],'bindings':scenario['bindings']}})
    # Both collection and editor deletion entrypoints share the list, in both locales and sizes.
    for locale,theme,width in [('en','day',1280),('ru','night',390)]:
        prefs(locale,theme)
        page.set_viewport_size({'width':width,'height':1000})
        for editor in [False,True]:
            visit('/connections/'+cid if editor else '/connections')
            scope=page.locator('[data-setting="general"]') if editor else page.get_by_role('row').filter(has=page.locator(f'a[href="/connections/{cid}"]'))
            scope.get_by_role('button',name='Actions' if locale=='en' else 'Действия',exact=True).click()
            page.get_by_role('menuitem',name='Delete' if locale=='en' else 'Удалить',exact=True).click()
            dialog=page.get_by_role('alertdialog')
            expect(dialog.get_by_role('listitem')).to_have_count(2)
            expect(dialog.get_by_role('button',name='Delete' if locale=='en' else 'Удалить',exact=True)).to_be_disabled()
            page.screenshot(path=f'/tmp/peek-delete-usage-{locale}-{editor}.png',animations='disabled')
            dialog.get_by_role('button',name='Cancel' if locale=='en' else 'Отмена',exact=True).click()
    prefs('en','day')
    page.set_viewport_size({'width':1280,'height':1000})
    visit('/connections')
    row=page.get_by_role('row').filter(has=page.locator(f'a[href="/connections/{cid}"]'))
    row.get_by_role('button',name='Actions',exact=True).click()
    page.get_by_role('menuitem',name='Delete',exact=True).click()
    dialog=page.get_by_role('alertdialog')
    dialog.get_by_role('button',name='Disconnect: '+optional['name'],exact=True).click()
    expect(dialog.get_by_role('listitem')).to_have_count(1)
    expect(dialog.get_by_role('button',name='Delete',exact=True)).to_be_disabled()
    dialog.get_by_role('button',name='Disconnect: '+scenario['name'],exact=True).click()
    nested=page.get_by_role('alertdialog',name='Disable and disconnect',exact=True)
    expect(nested.get_by_role('alert')).to_contain_text('This scenario will be disabled')
    nested.get_by_role('button',name='Cancel',exact=True).click()
    expect(dialog.get_by_role('listitem')).to_have_count(1)
    dialog.get_by_role('button',name='Disconnect: '+scenario['name'],exact=True).click()
    nested.get_by_role('button',name='Disable and disconnect',exact=True).click()
    expect(page.get_by_role('alertdialog')).to_have_count(1)
    expect(dialog.get_by_role('button',name='Delete',exact=True)).to_be_enabled()
    expect(dialog.get_by_text('No scenarios use this connection yet.',exact=True)).to_be_visible()
    assert any(i['id']==cid for i in status()['instances'])
    dialog.get_by_role('button',name='Delete',exact=True).click()
    expect(dialog).to_have_count(0)
    expect(row).to_have_count(0)
    assert not any(i['id']==cid for i in status()['instances'])
    assert not errors, errors
    browser.close()
print('Connection deletion dependency checks passed')
