(() => {
  'use strict';
  const bundle = window.MR_SOFTWARE_GRAPHS;
  const $ = id => document.getElementById(id);
  if (!bundle?.repositories?.length) {
    $('graph-provenance').textContent = 'The code map could not be loaded. Reload the page to try again.';
    document.body.dataset.graphReady = 'true';
    return;
  }
  const repositories = new Map(bundle.repositories.map(repo => [repo.id,repo]));
  const number = value => new Intl.NumberFormat('en-GB').format(value);
  let current, currentRepo, currentFile, shownFiles = 8;
  function state() {
    const params = new URLSearchParams(location.search);
    const repo = repositories.get(params.get('repo')) ?? bundle.repositories[0];
    return {repo:repo.id,file:repo.files.some(file=>file.id===params.get('file'))?params.get('file'):repo.defaultFile,
      query:params.get('q')??'',code:params.get('view')==='code',sources:params.get('sources')==='1'};
  }
  function address(change) {
    const next = {...current,...change};
    const params = new URLSearchParams(location.search);
    if (next.code) params.set('view','code'); else params.delete('view');
    params.set('repo',next.repo);params.set('file',next.file);
    if (next.query) params.set('q',next.query); else params.delete('q');
    params.delete('sources');
    return `${location.pathname}?${params}`;
  }
  function navigate(change) {
    const url = address(change);
    if(url!==location.pathname+location.search)history.pushState(null,'',url);
    shownFiles = 8;
    window.dispatchEvent(new Event('popstate'));
    if(!state().code)window.scrollTo({top:0,behavior:'instant'});
  }
  function bind(link,change) {
    link.setAttribute('href',address(change));
    link.addEventListener('click',event=>{
      if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      event.preventDefault();navigate(change);
    });
  }
  function el(tag,className,text) {
    const item=document.createElement(tag);
    if(className)item.className=className;
    if(text!=null)item.textContent=text;
    return item;
  }
  function svg(tag,attributes={},text) {
    const item=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [name,value]of Object.entries(attributes))item.setAttribute(name,String(value));
    if(text!=null)item.textContent=text;
    return item;
  }
  function neighbors() {
    const files=new Map(currentRepo.files.map(file=>[file.id,file]));
    return currentRepo.links.filter(link=>link.source===current.file||link.target===current.file)
      .map(link=>({file:files.get(link.source===current.file?link.target:link.source),link}))
      .sort((a,b)=>b.link.count-a.link.count||a.file.path.localeCompare(b.file.path));
  }
  function fileLink(file,className) {
    const link=el('a',className,file.path);
    bind(link,{code:true,file:file.id,query:''});
    link.setAttribute('aria-label',`Inspect ${file.path}`);
    if(file.id===current.file)link.setAttribute('aria-current','page');
    return link;
  }
  function renderFileList() {
    const query=current.query.toLocaleLowerCase().trim();
    $('code-panel').dataset.searching=String(Boolean(query));
    $('search-slot').dataset.active=String(Boolean(query));
    const target=query?$('search-slot'):$('code-grid');
    if($('file-browser').parentElement!==target)target.append($('file-browser'));
    const matches=currentRepo.files.filter(file=>!query||file.path.toLocaleLowerCase().includes(query)||file.symbols.some(symbol=>symbol.label.toLocaleLowerCase().includes(query)));
    $('file-match-count').textContent=`${number(matches.length)} files`;
    $('file-list').replaceChildren();
    for(const file of matches.slice(0,shownFiles)) {
      const link=fileLink(file,'file-row');
      link.append(el('span','file-degree',`${file.degree} connections`));
      $('file-list').append(link);
    }
    if(!matches.length)$('file-list').append(el('p','empty-state','No files match. Try a file name or a function.'));
    $('more-files').hidden=matches.length<=shownFiles;
    $('more-files').textContent=`Show ${Math.min(20,Math.max(0,matches.length-shownFiles))} more files`;
  }
  function renderNetwork() {
    if(!currentRepo||!currentFile)return;
    const width=Math.max(240,$('code-network').clientWidth),height=380;
    const all=neighbors(),visible=all.slice(0,width<420?6:12);
    const center={x:width/2,y:height/2};
    const positions=new Map([[currentFile.id,center]]);
    const rx=Math.min(width/2-53,260),ry=145;
    visible.forEach(({file},index)=>{
      const angle=(index/visible.length)*Math.PI*2-Math.PI/2;
      positions.set(file.id,{x:center.x+Math.cos(angle)*rx,y:center.y+Math.sin(angle)*ry});
    });
    const canvas=svg('svg',{viewBox:`0 0 ${width} ${height}`,role:'group','aria-label':`File connections for ${currentFile.path}`});
    canvas.append(svg('title',{},`Graphify file connections: ${currentFile.path}`));
    for(const {file,link}of visible) {
      const p=positions.get(file.id);
      const line=svg('line',{x1:center.x,y1:center.y,x2:p.x,y2:p.y,stroke:'#b8c7e2','stroke-width':Math.min(3,1+Math.log2(link.count+1)/3),...(link.inferred?{'stroke-dasharray':'4 4'}:{})});
      line.append(svg('title',{},Object.entries(link.relations).map(([relation,count])=>`${relation}: ${count}`).join(' · ')));
      canvas.append(line);
    }
    for(const file of [currentFile,...visible.map(item=>item.file)]) {
      const p=positions.get(file.id),selected=file.id===currentFile.id;
      const link=svg('a',{'aria-label':`Inspect ${file.path}`,class:'graph-node'});
      bind(link,{code:true,file:file.id,query:''});
      // SVGAnimatedString requires an attribute rather than HTMLElement.href.
      link.setAttribute('href',address({code:true,file:file.id,query:''}));
      link.append(svg('title',{},file.path));
      link.append(svg('rect',{x:p.x-48,y:p.y-17,width:96,height:40,rx:8,fill:selected?'#edf3ff':'#fff',stroke:selected?'#3266de':'#e1e7ef'}));
      link.append(svg('circle',{cx:p.x,cy:p.y-5,r:4,fill:selected?'#3266de':'#8ca8de'}));
      const max=width<420?13:16;
      const label=file.name.length>max?file.name.slice(0,max-1)+'…':file.name;
      link.append(svg('text',{x:p.x,y:p.y+12,'text-anchor':'middle',class:'graph-node-label'},label));
      canvas.append(link);
    }
    $('code-network').replaceChildren(canvas);
    $('network-caption').textContent=`${number(visible.length)} of ${number(all.length)} connected files shown. ${number(all.reduce((sum,item)=>sum+item.link.count,0))} recorded relationships touch this file.`;
  }
  function renderDetails() {
    const title=$('selected-file-name');
    title.textContent=currentFile.name;title.href=address({code:true,file:currentFile.id});
    title.onclick=event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey){event.preventDefault();navigate({code:true,file:currentFile.id});}};
    $('selected-file-path').replaceChildren(fileLink(currentFile,''));
    $('file-source-link').href=currentFile.url;
    $('connected-files').replaceChildren();
    for(const {file,link}of neighbors()) {
      const row=el('div','connection-row');
      row.append(fileLink(file,'connection-link'),el('span','connection-relation',`${Object.keys(link.relations).join(' · ')} · ${link.count}${link.inferred?' · includes inferred':''}`));
      $('connected-files').append(row);
    }
    if(!neighbors().length)$('connected-files').append(el('p','empty-state','No cross-file connections are recorded in this snapshot.'));
    $('file-symbols').replaceChildren();
    for(const symbol of currentFile.symbols.slice(0,24)) {
      const link=el('a','symbol-link',symbol.label);
      link.href=currentFile.url+'#L'+symbol.line;link.target='_blank';link.rel='noopener noreferrer';
      link.append(el('span',null,'L'+symbol.line));$('file-symbols').append(link);
    }
    if(currentFile.symbols.length>24)$('file-symbols').append(el('p','chart-note',`${number(currentFile.symbols.length-24)} more definitions are available in the source file.`));
  }
  function render() {
    const next=state();
    if(current?.repo!==next.repo)shownFiles=8;
    current=next;currentRepo=repositories.get(current.repo);currentFile=currentRepo.files.find(file=>file.id===current.file);
    $('codebase-select').value=current.repo;$('code-search').value=current.query;
    const time=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Copenhagen'}).format(new Date(currentRepo.indexedAt));
    $('graph-provenance').textContent=`${currentRepo.engine} · ${time} CEST · ${currentRepo.commit.slice(0,7)}`;
    $('graph-totals').textContent=`${number(currentRepo.totalNodes)} nodes · ${number(currentRepo.totalRelationships)} relationships · ${number(currentRepo.files.length)} files in this view`;
    const scope=$('graph-scope');
    scope.replaceChildren();
    const description=currentRepo.scope+' Source links point to the recorded commit. Graphs are dated snapshots and do not refresh automatically.';
    const parts=description.split('Workslip');
    scope.append(document.createTextNode(parts[0]));
    for(const part of parts.slice(1)) {
      const project=window.MR_SOFTWARE_DATA.projects.find(item=>item.name==='Workslip');
      const link=el('a',null,'Workslip');link.href='?project='+project.id;
      scope.append(link,document.createTextNode(part));
    }
    $('graph-nav').setAttribute('aria-current',current.code?'location':'false');
    $('progress-nav').setAttribute('aria-current',current.code?'false':'location');
    $('graph-nav').href=address({code:true});$('progress-nav').href=address({code:false});$('graph-back').href=address({code:false});
    renderFileList();renderDetails();renderNetwork();
    document.body.dataset.graphReady='true';
    if(current.code&&!current.sources)requestAnimationFrame(()=>window.scrollTo({top:$('code-panel').getBoundingClientRect().top+window.scrollY,behavior:'instant'}));
  }
  for(const id of ['graph-nav','progress-nav','graph-back'])$(id).addEventListener('click',event=>{
    if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();navigate({code:id==='graph-nav'});
  });
  $('codebase-select').addEventListener('change',event=>{
    const repo=repositories.get(event.target.value);navigate({code:true,repo:repo.id,file:repo.defaultFile,query:''});
  });
  $('code-search').addEventListener('input',event=>{
    current.query=event.target.value;shownFiles=8;
    history.replaceState(null,'',address({code:true,query:current.query}));renderFileList();
  });
  $('more-files').addEventListener('click',()=>{shownFiles+=20;renderFileList();});
  window.addEventListener('popstate',render);window.addEventListener('dashboard:navigate',render);
  render();new ResizeObserver(renderNetwork).observe($('code-network'));
})();
