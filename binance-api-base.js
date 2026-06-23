function resolveProtocolApiBase() {
    try {
        const ls = localStorage.getItem('PROTOCOL_API_BASE');
        if (ls) return String(ls).replace(/\/$/, '');
    } catch (e) { /* ignore */ }
    const h = window.location.hostname;
    const proto = window.location.protocol;
    if (h === 'localhost' || h === '127.0.0.1') {
        return 'http://127.0.0.1:8001';
    }
    if (proto === 'file:' || !h) {
        return 'http://127.0.0.1:8001';
    }
    return 'http://13.158.69.58:8001';
    //return 'https://next-k-protocol-production.up.railway.app';
}

try {
    localStorage.removeItem('PROTOCOL_MAINTENANCE_TOKEN');
} catch (e) { /* ignore */ }
