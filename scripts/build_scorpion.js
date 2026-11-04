// Script to generate index-scorpion.js from index-BcW0hOmG.js with cloud auto-repair and UI
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

// 4. Expose Scorpion Global API and enhance Y() with server catalog hybrid streaming
// Let's inspect where Y() is defined:
// async function Y(t={}){try{const e=await H.load(de,t),n=[];for(const a of de){const s=e.get(a);if(s)for await(const[r,o]of s.entries()){if(!r.toLowerCase().endsWith(".big")||o.kind!=="file")continue;const i=await o.getFile();n.push({mount:`/${a}`,name:r,url:`local:${a}/${r}`,size:i.size,file:await o.getFile()})}}return n}catch(e){return console.debug("local archives unavailable",e),[]}}

const oldY = 'async function Y(t={}){try{const e=await H.load(de,t),n=[];for(const a of de){const s=e.get(a);if(s)for await(const[r,o]of s.entries()){if(!r.toLowerCase().endsWith(".big")||o.kind!=="file")continue;const i=await o.getFile();n.push({mount:`/${a}`,name:r,url:`local:${a}/${r}`,size:i.size,file:await o.getFile()})}}return n}catch(e){return console.debug("local archives unavailable",e),[]}}';

if (!js.includes(oldY)) {
    console.error('ERROR: oldY not found in js!');
    process.exit(1);
}

// Replacement for Y() that merges local archives with server repair catalog
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
    // Query Captalvo Server Repair Catalog to automatically repair and supply missing/divergent archives
    try {
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
                  // No 'file' property: Me worker will stream via HTTP Range from url
                });
                foundNames.add(nameLower);
                repairedCount++;
              }
            }
          }
        }
        if(repairedCount > 0){
          console.info(\`[Captalvo Scorpion] Auto-reparo ativado: \${repairedCount} arquivos suplementados via streaming direto da nuvem!\`);
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

// Also enhance onPick message to inform about cloud auto-repair
js = js.replace(
    'if(!e.has("GeneralsZH"))return"No Zero Hour archives (*ZH.big) under that folder — pick the install folder.";',
    'if(!e.has("GeneralsZH")&&!e.has("Generals")){return"Nenhum arquivo .big encontrado nessa pasta. Selecione a pasta com os arquivos do jogo ou use o painel Reparar.";}'
);

const outJsPath = path.join(__dirname, '..', 'public', 'scorpion', 'assets', 'index-scorpion.js');
fs.writeFileSync(outJsPath, js, 'utf8');
console.log('Successfully generated index-scorpion.js! Size:', js.length);
