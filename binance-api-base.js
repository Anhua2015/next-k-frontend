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
    //return 'http://43.167.241.153:8001'; 
    return 'https://next-k-protocol-production.up.railway.app';
}

function getProtocolToken() {
    try {
        const ls = localStorage.getItem('PROTOCOL_MAINTENANCE_TOKEN');
        if (ls && String(ls).trim()) return String(ls).trim();
    } catch (e) { /* ignore */ }
    return '';
}

function setProtocolToken(tok) {
    const t = String(tok || '').trim();
    if (!t) return false;
    try {
        localStorage.setItem('PROTOCOL_MAINTENANCE_TOKEN', t);
    } catch (e) {
        return false;
    }
    return true;
}

function clearProtocolToken() {
    try {
        localStorage.removeItem('PROTOCOL_MAINTENANCE_TOKEN');
    } catch (e) { /* ignore */ }
}
