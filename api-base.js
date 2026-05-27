function resolveApiBase() {
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
    return 'http://43.167.241.153:8000';
    //return 'https://next-k-api-production.up.railway.app';
}

function getMaintenanceToken() {
    try {
        const ls = localStorage.getItem('NEXT_K_MAINTENANCE_TOKEN');
        if (ls && String(ls).trim()) return String(ls).trim();
    } catch (e) { /* ignore */ }
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
