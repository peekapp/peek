"""Check dashboard timing and heartbeat handling against an isolated running app."""
import sys
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1].rstrip("/")
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.add_init_script("""
        window.EventSource = class extends EventTarget {
            constructor() { super(); window.screenStream = this; }
            close() {}
            emit(type, data) {
                const event = new MessageEvent(type, { data: JSON.stringify(data) });
                if (type === 'message') this.onmessage(event);
                else this.dispatchEvent(event);
            }
        };
    """)
    page.clock.install()
    page.goto(base + "/screens/default")
    page.wait_for_function("Boolean(window.screenStream?.onmessage)")
    state = page.request.get(base + "/api/screens/default/state").json()
    page.evaluate("""state => {
        const now = Date.now();
        window.cardStart = now;
        window.screenStream.emit('message', {
            ...state, locale: 'en', serverTime: now, heartbeat: now,
            connectionErrors: 0, scenarioErrors: 0,
            cards: [{ id: 'timing', kind: 'meeting', title: 'Heartbeat test',
                owner: { name: 'Shared', color: 'blue', system: true },
                visibleFrom: now, targetAt: now + 20000, urgentAt: now + 10000,
                expiresAt: now + 25000, priority: 1, urgentPriority: 2 }]
        });
    }""", state)
    expect(page.get_by_text("Heartbeat test", exact=True)).to_be_visible()
    expect(page.get_by_text("00:20", exact=True)).to_be_visible()
    for seconds in [5, 10, 15, 20]:
        page.clock.run_for(5000)
        page.evaluate("""() => window.screenStream.emit('heartbeat', {
            serverTime: Date.now(), heartbeat: Date.now()
        })""")
        expect(page.get_by_text("Heartbeat test", exact=True)).to_be_visible()
        expect(page.get_by_role("status")).to_have_count(0)
        expect(page.get_by_text("Started" if seconds == 20 else f"00:{20-seconds:02}", exact=True)).to_be_visible()
    page.clock.run_for(5000)
    expect(page.get_by_text("Heartbeat test", exact=True)).not_to_be_visible()
    page.evaluate("""() => window.screenStream.emit('unavailable', {})""")
    expect(page.get_by_role("status")).to_be_visible()
    page.evaluate("""state => window.screenStream.emit('message', {
        ...state, cards: [], serverTime: Date.now(), heartbeat: Date.now(),
        connectionErrors: 0, scenarioErrors: 0
    })""", state)
    expect(page.get_by_role("status")).to_have_count(0)
    page.clock.run_for(11000)
    expect(page.get_by_role("status")).to_be_visible()
    page.evaluate("""() => window.screenStream.emit('heartbeat', {
        serverTime: Date.now(), heartbeat: Date.now()
    })""")
    expect(page.get_by_role("status")).to_have_count(0)
    browser.close()
    print("PASS: heartbeat-only traffic preserves cards, local countdown/expiry, and connection health")
