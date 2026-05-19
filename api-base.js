function resolveApiBase() {
    try {
        const q = new URLSearchParams(window.location.search).get('api');
        if (q) return String(q).replace(/\/$/, '');
    } catch (e) { /* ignore */ }
    try {
        const ls = localStorage.getItem('NEXT_K_API_BASE');
        if (ls) return String(ls).replace(/\/$/, '');
    } catch (e) { /* ignore */ }
    const h = window.location.hostname;
    const proto = window.location.protocol;
    if (h === 'localhost' || h === '127.0.0.1') {
        return 'http://127.0.0.1:8000';
    }
    if (proto === 'file:' || !h) {
        return 'http://127.0.0.1:8000';
    }
    return 'https://next-k-api-production.up.railway.app';
}

function getMaintenanceToken() {
    try {
        const q = new URLSearchParams(window.location.search).get('maint_token');
        if (q && String(q).trim()) return String(q).trim();
    } catch (e) { /* ignore */ }
    try {
        const ls = localStorage.getItem('NEXT_K_MAINTENANCE_TOKEN');
        if (ls && String(ls).trim()) return String(ls).trim();
    } catch (e2) { /* ignore */ }
    return '';
}

function setMaintenanceToken(tok) {
    const t = String(tok || '').trim();
    if (!t) return false;
    try {
        localStorage.setItem('NEXT_K_MAINTENANCE_TOKEN', t);
    } catch (e) {
        return false;
    }
    return true;
}

function clearMaintenanceToken() {
    try {
        localStorage.removeItem('NEXT_K_MAINTENANCE_TOKEN');
    } catch (e) { /* ignore */ }
}
