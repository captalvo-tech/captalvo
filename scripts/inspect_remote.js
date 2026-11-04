const { execSync } = require('child_process');

try {
    const raw = execSync('ssh -p 65002 u415074840@186.244.144.164 "cat /home/u415074840/domains/captalvo.online/app/storage/logs/sessions/session_sess_mw1dv0nk_a6fwyu.json"').toString('utf8');
    const d = JSON.parse(raw);
    console.log('Total events:', d.events.length);
    const matches = d.events.filter(e => e.message && (
        e.message.toLowerCase().includes('csf') || 
        e.message.toLowerCase().includes('prerun') || 
        e.message.toLowerCase().includes('english') || 
        e.message.toLowerCase().includes('brazilian') ||
        e.message.toLowerCase().includes('bigvfs') ||
        e.message.toLowerCase().includes('mounted archive') ||
        e.message.toLowerCase().includes('fatal') ||
        e.message.toLowerCase().includes('ini')
    ));
    for (const m of matches) {
        console.log(`[${m.time}] [${m.level}] [${m.category}] ${m.message}`);
    }
} catch (e) {
    console.error('Error:', e.message);
}
