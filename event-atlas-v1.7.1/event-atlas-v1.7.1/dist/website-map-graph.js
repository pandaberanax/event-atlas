import {t,locale} from './i18n.js';

const NS='http://www.w3.org/2000/svg';
const STEP=240;
const TOP=64;
const HEIGHT=390;
const BAR=12;
const COLORS=['#2563eb','#ea580c','#7c3aed','#0891b2'];
const fmt=value=>Number(value).toLocaleString(locale());

function element(name,attributes={},text) {
  const node=document.createElementNS(NS,name);
  for (const [key,value] of Object.entries(attributes)) node.setAttribute(key,value);
  if (text!==undefined) node.textContent=text;
  return node;
}

export function renderWebsiteGraph(container,tree,{start='/',trail=[],expanded=new Set(),onSelect,onMore}) {
  container.replaceChildren();
  const root=tree.get(start) || tree.get('/');
  if (!root?.count) return;
  const svg=element('svg',{xmlns:NS,role:'group','aria-label':t('mapGraphTitle')});
  const columns=[{parent:null,nodes:[root]}];
  let parent=root;
  const steps=Math.max(...[...tree.values()].map(node=>node.depth))+1;
  for (let step=1;step<=steps;step++) {
    let children=parent.children.map(id=>tree.get(id));
    if (parent.own.length) children.push({id:parent.id+'\u0000self',parentId:parent.id,label:t('mapThisPage'),
      count:parent.own.length,children:[],own:parent.own,terminal:true});
    if (!children.length || children.length===1 && children[0].terminal && !parent.children.length) break;
    children.sort((a,b)=>b.count-a.count || a.label.localeCompare(b.label));
    const size=expanded.has(parent.id)?children.length:6;
    const visible=children.slice(0,size);
    const hidden=children.slice(size);
    if (hidden.length) visible.push({id:parent.id+'\u0000more',parentId:parent.id,label:t('mapMore',{n:hidden.length}),
      count:hidden.reduce((sum,node)=>sum+node.count,0),more:true,children:[]});
    columns.push({parent,nodes:visible});
    parent=visible.find(node=>node.id===trail[step-1] && !node.more) || visible.find(node=>!node.more && node.children.length);
    if (!parent || parent.terminal || !parent.children.length) break;
  }
  const width=columns.length*STEP;
  const scale=HEIGHT/root.count;
  const layout=new Map();
  columns.forEach((column,index)=>{
    const x=20+index*STEP;
    svg.append(element('text',{x,y:20,class:'map-column-heading'},index===0?t('mapStartingPath'):t('mapStep',{n:index})));
    let y=TOP;
    for (const [position,node] of column.nodes.entries()) {
      const h=scale*node.count;
      layout.set(node.id,{node,x,y,h,index,color:index===0?'#475569':COLORS[(position+index-1)%COLORS.length]});
      y+=Math.max(h,36)+22;
    }
  });
  const canvasHeight=Math.max(500,...[...layout.values()].map(item=>item.y+Math.max(item.h,36)+30));
  svg.setAttribute('viewBox','0 0 '+width+' '+canvasHeight);
  svg.setAttribute('width',width);
  svg.setAttribute('height',canvasHeight);
  for (const column of columns.slice(1)) {
    const source=layout.get(column.parent.id);
    let offset=0;
    for (const child of column.nodes) {
      const target=layout.get(child.id);
      const thickness=source.h*child.count/column.parent.count;
      const x1=source.x+BAR;
      const x2=target.x;
      const a=source.y+offset;
      const b=target.y;
      const mid=(x1+x2)/2;
      const path='M '+x1+' '+a+' C '+mid+' '+a+' '+mid+' '+b+' '+x2+' '+b+
        ' L '+x2+' '+(b+target.h)+' C '+mid+' '+(b+target.h)+' '+mid+' '+(a+thickness)+' '+x1+' '+(a+thickness)+' Z';
      const route=trail.includes(child.id);
      svg.append(element('path',{d:path,class:'map-flow'+(route?' map-route':''),fill:target.color,'data-path':child.parentId||child.id}));
      offset+=thickness;
    }
  }
  for (const item of layout.values()) {
    const {node,x,y,h,index,color}=item;
    const title=(node.more?node.label:(node.terminal?node.parentId:node.id))+' · '+t('mapUrlCount',{n:fmt(node.count)})+
      ' · '+new Intl.NumberFormat(locale(),{style:'percent',maximumFractionDigits:1}).format(node.count/root.count);
    const group=element('g',{role:'button',tabindex:'0','aria-label':title,'data-path':node.parentId||node.id,class:'map-graph-node'+(trail.includes(node.id)?' selected':'')});
    group.append(element('title',{},title));
    group.append(element('rect',{x,y,width:BAR,height:h,rx:2,fill:color,class:node.more?'map-node-more':'map-node-bar'}));
    group.append(element('rect',{x:x+BAR,y,width:195,height:Math.max(h,38),fill:'transparent'}));
    const text=element('text',{x:x+BAR+8,y:y+13,class:'map-node-label'});
    text.textContent=node.label.length>24?node.label.slice(0,23)+'…':node.label;
    group.append(text,element('text',{x:x+BAR+8,y:y+30,class:'map-node-count'},t('mapUrlCount',{n:fmt(node.count)})));
    const activate=()=>node.more?onMore(node.parentId):onSelect(node,index);
    group.addEventListener('click',activate);
    group.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();activate();}});
    const highlight=()=>{
      svg.classList.add('map-highlighting');
      const path=node.parentId||node.id;
      for(const candidate of svg.querySelectorAll('[data-path]')){
        const value=candidate.getAttribute('data-path');
        candidate.classList.toggle('map-highlight',path==='/' || value==='/' || value===path || value.startsWith(path+'/') || path.startsWith(value+'/'));
      }
    };
    const clear=()=>svg.classList.remove('map-highlighting');
    group.addEventListener('pointerenter',highlight);group.addEventListener('pointerleave',clear);
    group.addEventListener('focus',highlight);group.addEventListener('blur',clear);
    svg.append(group);
  }
  container.append(svg);
}
