// Simple E2E auth test script
const base = process.env.API_BASE || 'http://localhost:4001';
const phone = process.env.PHONE || '+79991112233';

(async () => {
  try {
    const r1 = await fetch(base + '/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const j1 = await r1.json().catch(()=>({}));
    console.log('request:', r1.status, j1);
    if (!r1.ok) process.exit(2);
    const code = j1.devCode || process.env.CODE;
    if (!code) {
      console.error('No devCode returned; set CODE env to proceed.');
      process.exit(3);
    }
    const r2 = await fetch(base + '/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code })
    });
    const j2 = await r2.json().catch(()=>({}));
    console.log('verify:', r2.status, j2);
    process.exit(r2.ok ? 0 : 1);
  } catch (e) {
    console.error('Error:', e);
    process.exit(4);
  }
})();
