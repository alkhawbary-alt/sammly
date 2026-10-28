/**
 * Runs inside the render page (export and preview). For every `[data-fit]` text box it
 * binary-searches the font size between the designed size and `min` until the text fits
 * the box (and `maxLines`). Boxes that still overflow at `min` get `data-overflow` and
 * their field keys are reported in `window.__sammly.overflow`.
 *
 * Contract with the worker: wait for `window.__sammly.done === true` before screenshotting.
 * The preview iframe can call `window.__sammlyFit()` again after live edits.
 */
export const AUTOFIT_NONCE = 'sammly-fit';

export function autofitScript(fontFaces: { family: string; weight: number; style: string }[]): string {
  const faces = JSON.stringify(fontFaces);
  return `(function(){
var FACES=${faces.replace(/</g, '\\u003c')};
function fits(box,tx,cfg,size){
  tx.style.fontSize=size+'px';
  if(tx.scrollWidth>tx.clientWidth+1)return false;
  if(tx.scrollHeight>box.clientHeight+1)return false;
  if(cfg.maxLines){var lh=parseFloat(getComputedStyle(tx).lineHeight)||size*1.2;if(Math.round(tx.scrollHeight/lh)>cfg.maxLines)return false;}
  return true;
}
function fitBox(box){
  var cfg=JSON.parse(box.getAttribute('data-fit'));var tx=box.firstElementChild;if(!tx)return true;
  box.removeAttribute('data-overflow');
  var hi=cfg.size,lo=cfg.min;
  if(fits(box,tx,cfg,hi))return true;
  if(!fits(box,tx,cfg,lo)){box.setAttribute('data-overflow','1');return false;}
  while(hi-lo>0.25){var mid=(hi+lo)/2;if(fits(box,tx,cfg,mid))lo=mid;else hi=mid;}
  tx.style.fontSize=lo+'px';return true;
}
function anchor(box){
  var tx=box.firstElementChild;var m=tx&&tx.querySelector('.bl');if(!m)return;
  tx.style.marginTop='0px';
  tx.style.marginTop=(parseFloat(box.getAttribute('data-baseline'))-m.offsetTop)+'px';
}
function run(){
  var over=[];var boxes=document.querySelectorAll('[data-fit]');
  for(var i=0;i<boxes.length;i++){if(!fitBox(boxes[i])){var k=boxes[i].getAttribute('data-fields');if(k)over=over.concat(k.split(','));}}
  var anchored=document.querySelectorAll('[data-baseline]');
  for(var j=0;j<anchored.length;j++)anchor(anchored[j]);
  window.__sammly={done:true,overflow:over};
  return over;
}
window.__sammlyFit=run;
window.__sammly={done:false,overflow:[]};
var loads=FACES.map(function(f){return document.fonts.load(f.style+' '+f.weight+' 32px "'+f.family+'"').catch(function(){});});
Promise.all(loads).then(function(){return document.fonts.ready;}).then(run,run);
})();`;
}
