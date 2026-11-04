const { execSync } = require('child_process');
const raw = execSync('ssh -p 65002 u415074840@186.244.144.164 "cat /home/u415074840/domains/captalvo.online/app/storage/logs/sessions/session_sess_mw1kvis3_tsbig2.json"').toString('utf8');
const d = JSON.parse(raw);
console.log('Total events:', d.events.length);
for (const e of d.events) {
    const msg = (e.message || '').toLowerCase();
    if (
        msg.includes('sdl') || 
        msg.includes('window') || 
        msg.includes('mouse') || 
        msg.includes('cursor') || 
        msg.includes('resolution') || 
        msg.includes('screen') || 
        msg.includes('size') || 
        msg.includes('view') ||
        msg.includes('canvas') ||
        msg.includes('gl_') ||
        msg.includes('w3d') ||
        msg.includes('fps') ||
        msg.includes('init')
    ) {
        console.log(`[${e.time}] [${e.category}] ${e.message}`);
    }
}
