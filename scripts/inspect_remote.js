const { execSync } = require('child_process');

try {
    const raw = execSync('ssh -p 65002 u415074840@186.244.144.164 "cat /home/u415074840/domains/captalvo.online/app/storage/logs/sessions/session_sess_mw1dv0nk_a6fwyu.json"').toString('utf8');
    const d = JSON.parse(raw);
    const events = d.events || [];
    
    // Find last session run
    let lastStartIdx = 0;
    for (let i = 0; i < events.length; i++) {
        if (events[i].message && events[i].message.includes('Sessão do Captalvo iniciada')) {
            lastStartIdx = i;
        }
    }

    console.log(`Analyzing last run starting at event index ${lastStartIdx} (${events[lastStartIdx]?.time}):`);
    const lastRunEvents = events.slice(lastStartIdx);

    for (const e of lastRunEvents) {
        if (e.message && (e.message.includes('Mounted archive') || e.message.includes('VFS') || e.message.includes('generals.csf') || e.message.includes('CRASH') || e.message.includes('preRun') || e.message.includes('Captalvo'))) {
            console.log(`[${e.time}] [${e.level}] ${e.message}`);
        }
    }
} catch (e) {
    console.error('Error:', e.message);
}
