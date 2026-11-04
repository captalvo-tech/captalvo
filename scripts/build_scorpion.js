// Script to generate index-scorpion.js with cloud auto-repair and 1m11s Intro Video Preloader
const fs = require('fs');
const path = require('path');

const srcJsPath = path.join(__dirname, '..', 'public', 'webgpu', 'assets', 'index-BcW0hOmG.js');
let js = fs.readFileSync(srcJsPath, 'utf8');

console.log('Original JS size:', js.length);

// 1. Replace all /webgpu/ paths with /scorpion/
js = js.replaceAll('/webgpu/', '/scorpion/');

// 2. Isolate IndexedDB database for Scorpion
js = js.replace('const H=new Ie("generalsx")', 'const H=new Ie("captalvo_scorpion")');

// 3. Update title/branding
js = js.replace('key:"generalsX",title:"GeneralsX",subtitle:"WebAssembly + WebGPU"', 'key:"generalsX",title:"Captalvo Scorpion",subtitle:"WebGPU + Auto-Reparo Cloud"');

// 4. Enhanced Y() with server catalog hybrid streaming
const oldY = 'async function Y(t={}){try{const e=await H.load(de,t),n=[];for(const a of de){const s=e.get(a);if(s)for await(const[r,o]of s.entries()){if(!r.toLowerCase().endsWith(".big")||o.kind!=="file")continue;const i=await o.getFile();n.push({mount:`/${a}`,name:r,url:`local:${a}/${r}`,size:i.size,file:await o.getFile()})}}return n}catch(e){return console.debug("local archives unavailable",e),[]}}';

if (!js.includes(oldY)) {
    console.error('ERROR: oldY not found in js!');
    process.exit(1);
}

const newY = `
async function Y(t={}){
  try{
    const e=await H.load(de,t),n=[],foundNames=new Set();
    for(const a of de){
      const s=e.get(a);
      if(s)for await(const[r,o]of s.entries()){
        if(!r.toLowerCase().endsWith(".big")||o.kind!=="file")continue;
        const i=await o.getFile();
        if(i.size>0){
          foundNames.add(r.toLowerCase());
          n.push({mount:\`/\${a}\`,name:r,url:\`local:\${a}/\${r}\`,size:i.size,file:await o.getFile()});
        }
      }
    }
    // Query Captalvo Server Repair Catalog to automatically repair and supply missing archives
    try {
      if(typeof window !== 'undefined' && window.__scorpionSetEngineStatus){
        window.__scorpionSetEngineStatus("Consultando acervo do servidor para auto-reparo...");
      }
      const resp = await fetch('/api/repair.php?action=catalog');
      if(resp.ok){
        const cat = await resp.json();
        let repairedCount = 0;
        if(cat && cat.archives){
          for(const mountKey of ['GeneralsZH', 'Generals']){
            const list = cat.archives[mountKey] || [];
            for(const item of list){
              const nameLower = item.name.toLowerCase();
              if(!foundNames.has(nameLower)){
                n.push({
                  mount: \`/\${mountKey}\`,
                  name: item.name,
                  url: item.stream_url,
                  size: item.size
                  // No 'file' property: worker streams via HTTP Range
                });
                foundNames.add(nameLower);
                repairedCount++;
              }
            }
          }
        }
        if(repairedCount > 0){
          console.info(\`[Captalvo Scorpion] Auto-reparo: \${repairedCount} arquivos suplementados via streaming da nuvem!\`);
          if(typeof window !== 'undefined' && window.__scorpionOnRepair){
            window.__scorpionOnRepair({ localCount: n.length - repairedCount, cloudCount: repairedCount, total: n.length });
          }
        }
      }
    } catch(err) {
      console.warn('[Captalvo Scorpion] Falha ao consultar catálogo de reparo:', err);
    }
    return n;
  }catch(e){
    return console.debug("local archives unavailable",e),[]
  }
}
window.__scorpionGetLocalArchives = Y;
window.__scorpionGetDirHandle = () => H;
`;

js = js.replace(oldY, newY);

// 5. Hook yt(t) for real-time progress and MainMenu completion
const ytIdx = js.indexOf('function yt(t){');
if (ytIdx === -1) {
    console.error('ERROR: function yt(t) not found!');
    process.exit(1);
}
const ytEndMarker = 't.indexOf(")"))}`)}';
const ytEndIdx = js.indexOf(ytEndMarker, ytIdx);
if (ytEndIdx === -1) {
    console.error('ERROR: ytEndMarker not found!');
    process.exit(1);
}
const oldYt = js.slice(ytIdx, ytEndIdx + ytEndMarker.length);

const newYt = `function yt(t){
  if(t.startsWith("GENERALSX_LOAD_PROGRESS")&&(be=Date.now()),fe)return;
  if(t.includes("MainMenu.wnd")&&(he=!0),he&&t.includes("Push completed")){
    fe=!0,$("Running","");
    if(typeof window !== 'undefined' && window.__scorpionSetEngineReady){
      window.__scorpionSetEngineReady();
    }
    return;
  }
  const e=/initSubsystem\\('([^']+)'\\)/.exec(t);
  if(e){
    $("Starting engine",\`initialising \${e[1]}\`);
    if(typeof window !== 'undefined' && window.__scorpionSetEngineStatus){
      window.__scorpionSetEngineStatus(\`Inicializando subsistema: \${e[1]}\`);
    }
  } else if(t.startsWith("[INI] load(")){
    const iniName = t.slice(11,t.indexOf(")"));
    $("Starting engine",\`reading \${iniName}\`);
    if(typeof window !== 'undefined' && window.__scorpionSetEngineStatus){
      window.__scorpionSetEngineStatus(\`Lendo configuração: \${iniName}\`);
    }
  }
}`;

js = js.replace(oldYt, newYt);

// 6. Expose global audio muting hook
js = js.replace(
    'applyMute:t=>L?._GeneralsXSetAudioMuted?.(t?1:0)',
    'applyMute:t=>{if(typeof window!=="undefined"&&window.GeneralsXMuteAudio)window.GeneralsXMuteAudio(t);return L?._GeneralsXSetAudioMuted?.(t?1:0);}'
);

const audioHook = `
window.GeneralsXMuteAudio = function(muted) {
  if (typeof L !== 'undefined' && L && L._GeneralsXSetAudioMuted) {
    L._GeneralsXSetAudioMuted(muted ? 1 : 0);
  }
};
`;
js = audioHook + js;

// 7. Hook n(d) when folder is picked or boot begins to trigger 1m11s intro video
const oldN = 'if(e&&t.mountPicked){const l=e;e=void 0,await t.mountPicked(l,d),t.assetDependency&&l.removeRunDependency(t.assetDependency),c.hide();return}';
const newN = 'if(e&&t.mountPicked){const l=e;e=void 0;if(typeof window!=="undefined"&&window.ScorpionIntroManager&&!window.ScorpionIntroManager.isIntroPlaying()){window.ScorpionIntroManager.playIntroAndBoot();}await t.mountPicked(l,d),t.assetDependency&&l.removeRunDependency(t.assetDependency),c.hide();return}';

if (!js.includes(oldN)) {
    console.error('ERROR: oldN not found in js!');
    process.exit(1);
}
js = js.replace(oldN, newN);

// 8. Hook mountPicked status updates
const oldMountPicked = 'mountPicked:async t=>{const e=await Y();await A.ready;for(const n of e)A.mount(t,n);se(e),k(`Streaming ${e.length} archives from your selected folders.`)';
const newMountPicked = 'mountPicked:async t=>{if(typeof window!=="undefined"&&window.__scorpionSetEngineStatus){window.__scorpionSetEngineStatus("Montando arquivos de dados e suplementando via nuvem...");}const e=await Y();await A.ready;for(const n of e)A.mount(t,n);se(e),k(`Streaming ${e.length} archives from your selected folders.`);if(typeof window!=="undefined"&&window.__scorpionSetEngineStatus){window.__scorpionSetEngineStatus(`Arquivos prontos (${e.length} montados). Compilando shaders...`);}';

if (!js.includes(oldMountPicked)) {
    console.error('ERROR: oldMountPicked not found in js!');
    process.exit(1);
}
js = js.replace(oldMountPicked, newMountPicked);

// 9. Enhance onPick message to inform about cloud auto-repair
js = js.replace(
    'if(!e.has("GeneralsZH"))return"No Zero Hour archives (*ZH.big) under that folder — pick the install folder.";',
    'if(!e.has("GeneralsZH")&&!e.has("Generals")){return"Nenhum arquivo .big encontrado nessa pasta. Selecione a pasta com os arquivos do jogo ou use o painel Reparar.";}'
);

const outJsPath = path.join(__dirname, '..', 'public', 'scorpion', 'assets', 'index-scorpion.js');
fs.writeFileSync(outJsPath, js, 'utf8');
console.log('Successfully generated index-scorpion.js! Size:', js.length);
