(() => {
  'use strict';
  const data = window.MR_SOFTWARE_DATA;
  const $ = id => document.getElementById(id);
  if (!data) {
    $('page-description').textContent = 'The task snapshot could not be loaded. Reload the page to try again.';
    document.body.dataset.ready = 'true';
    return;
  }
  const colors = {completed:'#3266de',remaining:'#c48026',inProgress:'#38827f',ready:'#9aa8bd',backlog:'#d8e0ed'};
  const formatNumber = value => new Intl.NumberFormat('en-GB').format(value);
  const formatPercent = value => `${(value * 100).toFixed(1)}%`;
  const formatDate = value => new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:data.timezone}).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
  const timestamp = new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:data.timezone}).format(new Date(data.snapshotAt));
  const dialog = $('source-dialog');
  const projectById = new Map(data.projects.map(project => [project.id, project]));
  let state;
  let plotRows = [];
  let focusedIndex = null;

  function readState() {
    const params = new URLSearchParams(location.search);
    return {project:projectById.has(params.get('project')) ? params.get('project') : 'all',
      days:[7,14,30].includes(Number(params.get('days'))) ? Number(params.get('days')) : 30,
      sources:params.get('sources') === '1'};
  }
  function address(next, overview = false) {
    const params = new URLSearchParams(location.search);
    if (next.project !== 'all') params.set('project', next.project); else params.delete('project');
    if (next.days !== 30) params.set('days', String(next.days)); else params.delete('days');
    if (next.sources) params.set('sources','1'); else params.delete('sources');
    if (overview) params.delete('view');
    return `${location.pathname}${params.size ? '?'+params : ''}`;
  }
  function navigate(change, replace = false) {
    const next = {...state,...change};
    const url = address(next, 'project' in change || 'days' in change);
    if (url !== location.pathname+location.search) history[replace ? 'replaceState' : 'pushState'](null,'',url);
    render();
    window.dispatchEvent(new Event('dashboard:navigate'));
    if (!next.sources && new URLSearchParams(location.search).get('view') !== 'code') window.scrollTo({top:0,behavior:'instant'});
  }
  function create(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }
  function svgElement(tag, attributes = {}, text) {
    const element = document.createElementNS('http://www.w3.org/2000/svg',tag);
    for (const [name,value] of Object.entries(attributes)) element.setAttribute(name,String(value));
    if (text != null) element.textContent = text;
    return element;
  }
  for (const project of data.projects) {
    const option = new Option(project.name,project.id);
    $('project-select').add(option);
    const link = create('a',null,project.name);
    link.href = project.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label',`Open ${project.name} in Linear`);
    $('source-links').append(link);
  }
  const workslip = data.projects.find(project => project.name === 'Workslip');
  if (workslip) $('definitions-workslip').href = '?project=' + encodeURIComponent(workslip.id);
  $('snapshot-label').textContent = `Snapshot · ${timestamp} CEST`;
  $('source-timestamp').textContent = `Linear · Mr Software · ${timestamp} CEST`;
  $('coverage-detail').textContent = `All pages read: ${data.coverage.sourceProjects} projects, ${data.coverage.sourceIssues} issues and ${data.coverage.stateSpans} state intervals. Six current projects contain ${data.coverage.includedIssues} non-deleted tasks. ${data.coverage.deletedIssues} deleted tasks are excluded. Three archived, canceled projects have no current tasks. Unprojected tasks are outside this view.`;

  function renderProjects() {
    const list = $('project-list');
    list.replaceChildren();
    for (const project of data.projects) {
      const link = create('a','project-row');
      link.href = address({...state,project:project.id,sources:false},true);
      link.setAttribute('aria-label',project.name);
      if (state.project === project.id) link.setAttribute('aria-current','page');
      link.addEventListener('click',event => {
        if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); navigate({project:project.id,sources:false});
      });
      const line = create('div','project-line');
      line.append(create('span',null,project.name),create('span','project-count',`${project.completed} / ${project.total}`));
      const barLine = create('div','project-bar-line');
      const track = create('div','progress-track');
      const fill = create('div','progress-fill');
      const rate = project.total ? project.completed/project.total : 0;
      fill.style.width = `${rate*100}%`;
      track.append(fill);
      barLine.append(track,create('span','project-percent',formatPercent(rate)));
      link.append(line,barLine);
      list.append(link);
    }
  }
  function renderStatus(selected) {
    const statuses = [['completed','Completed'],['inProgress','In progress'],['ready','Ready'],['backlog','Backlog']];
    $('status-track').replaceChildren(); $('status-list').replaceChildren();
    for (const [key,label] of statuses) {
      const mark = create('span');
      mark.style.background = colors[key]; mark.style.width = `${selected.total ? selected[key]/selected.total*100 : 0}%`;
      $('status-track').append(mark);
      const row = create('div','status-item');
      const swatch = create('i','status-swatch'); swatch.style.background = colors[key]; swatch.setAttribute('aria-hidden','true');
      row.append(swatch,create('span',null,label),create('strong',null,formatNumber(selected[key])));
      $('status-list').append(row);
    }
    $('scope-label').textContent = `${formatNumber(selected.total)} tasks in current scope`;
    $('exclusion-note').textContent = `${formatNumber(selected.removed)} excluded from completion: ${selected.canceled} canceled · ${selected.duplicates} duplicates. ${selected.archivedOpen} open archived tasks remain in the backlog.`;
  }
  function renderChart() {
    if (!plotRows.length) return;
    const width = Math.max(240,$('trend-chart').clientWidth), height = $('trend-chart').clientHeight;
    const margin = {left:36,right:36,top:27,bottom:34};
    const plotWidth = width-margin.left-margin.right, plotHeight=height-margin.top-margin.bottom;
    const peak = Math.max(...plotRows.flatMap(row=>[row.remaining,row.completed]),1);
    const step = Math.max(1,Math.ceil(peak/4/5)*5), maximum=step*4;
    const x = index => margin.left+index/(plotRows.length-1)*plotWidth;
    const y = value => margin.top+plotHeight-value/maximum*plotHeight;
    const svg = svgElement('svg',{viewBox:`0 0 ${width} ${height}`,role:'img',tabindex:'0','aria-label':`Daily task history. ${plotRows.at(-1).remaining} remaining and ${plotRows.at(-1).completed} completed tasks on ${formatDate(plotRows.at(-1).date)}. Use arrow keys to inspect dates.`});
    svg.append(svgElement('title',{},'Daily remaining and completed task counts'));
    svg.append(svgElement('text',{x:0,y:12,class:'axis axis-title'},'Tasks'));
    for (let i=0;i<=4;i++) {
      const value=i*step, py=y(value);
      svg.append(svgElement('line',{x1:margin.left,x2:width-margin.right,y1:py,y2:py,stroke:'#e7ebf1','stroke-width':1}));
      svg.append(svgElement('text',{x:margin.left-8,y:py+4,class:'axis','text-anchor':'end'},formatNumber(value)));
    }
    const tickCount=width<410 ? 3 : 5;
    for(let i=0;i<=tickCount;i++) {
      const index=Math.round(i/tickCount*(plotRows.length-1));
      svg.append(svgElement('text',{x:x(index),y:height-9,class:'axis','text-anchor':i===0?'start':i===tickCount?'end':'middle'},formatDate(plotRows[index].date)));
    }
    for (const key of ['remaining','completed']) {
      const path=plotRows.map((row,index)=>`${index?'L':'M'}${x(index).toFixed(2)},${y(row[key]).toFixed(2)}`).join(' ');
      svg.append(svgElement('path',{d:path,fill:'none',stroke:colors[key],'stroke-width':2,'stroke-linejoin':'round',...(key==='completed'?{'stroke-dasharray':'5 4'}:{})}));
      const last=plotRows.at(-1);
      svg.append(svgElement('circle',{cx:x(plotRows.length-1),cy:y(last[key]),r:3.5,fill:colors[key]}));
      svg.append(svgElement('text',{x:width-margin.right+8,y:y(last[key])+4,class:'axis',fill:colors[key]},formatNumber(last[key])));
    }
    const guide=svgElement('line',{y1:margin.top,y2:height-margin.bottom,stroke:'#a4afbf','stroke-dasharray':'3 3',visibility:'hidden'});
    const markers=['remaining','completed'].map(key=>svgElement('circle',{r:4,fill:colors[key],visibility:'hidden',stroke:'#fff','stroke-width':1.5}));
    svg.append(guide,...markers);
    function inspect(index,showGuide=true) {
      focusedIndex=Math.max(0,Math.min(plotRows.length-1,index));
      const row=plotRows[focusedIndex];
      guide.setAttribute('x1',x(focusedIndex));guide.setAttribute('x2',x(focusedIndex));guide.setAttribute('visibility',showGuide?'visible':'hidden');
      ['remaining','completed'].forEach((key,i)=>{markers[i].setAttribute('cx',x(focusedIndex));markers[i].setAttribute('cy',y(row[key]));markers[i].setAttribute('visibility',showGuide?'visible':'hidden');});
      const detail=$('chart-detail');detail.replaceChildren();
      detail.append(create('strong',null,formatDate(row.date)),document.createTextNode(` · ${row.remaining} remaining · ${row.completed} completed`));
    }
    const pointer = event => {
      const box=svg.getBoundingClientRect();
      inspect(Math.round(((event.clientX-box.left)*width/box.width-margin.left)/plotWidth*(plotRows.length-1)));
    };
    svg.addEventListener('pointermove',pointer);svg.addEventListener('pointerdown',pointer);
    svg.addEventListener('pointerleave',()=>inspect(plotRows.length-1,false));
    svg.addEventListener('focus',()=>inspect(plotRows.length-1));
    svg.addEventListener('blur',()=>inspect(plotRows.length-1,false));
    svg.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();inspect((focusedIndex??plotRows.length-1)+(event.key==='ArrowRight'?1:-1));}});
    $('trend-chart').replaceChildren(svg);
    inspect(plotRows.length-1,false);
  }
  function render() {
    state=readState();
    const project=projectById.get(state.project), selected=project??data.portfolio;
    $('page-title').textContent=project?project.name:'Development overview';
    $('page-description').textContent=`${project?'Project task status':'Six current projects'} · Snapshot ${timestamp} CEST`;
    document.title=`${project?project.name+' · ':''}Development overview · MR Software`;
    $('project-select').value=state.project; $('period-select').value=String(state.days);
    $('completed-value').textContent=formatNumber(selected.completed);
    $('remaining-value').textContent=formatNumber(selected.remaining);
    $('completion-value').textContent=selected.total?formatPercent(selected.completed/selected.total):'—';
    $('completion-context').textContent=`${selected.completed} of ${selected.total} tasks`;
    $('remaining-context').textContent=`${selected.inProgress} in progress · ${selected.ready+selected.backlog} waiting`;
    plotRows=selected.series.slice(-(state.days+1));
    $('period-label').textContent=`${formatDate(plotRows[0].date)} – ${formatDate(plotRows.at(-1).date)}`;
    $('trend-subtitle').textContent=`${formatDate(plotRows[0].date)} – ${formatDate(plotRows.at(-1).date)} · Daily task counts`;
    $('linear-link').href=project?project.url:'https://linear.app/workslip';
    renderStatus(selected); renderProjects(); renderChart();
    if(state.sources&&!dialog.open)dialog.showModal();
    if(!state.sources&&dialog.open)dialog.close();
    document.body.dataset.ready='true';
  }
  $('project-select').addEventListener('change',event=>navigate({project:event.target.value,sources:false}));
  $('period-select').addEventListener('change',event=>navigate({days:Number(event.target.value),sources:false}));
  $('sources-button').addEventListener('click',()=>navigate({sources:true}));
  $('close-sources').addEventListener('click',()=>navigate({sources:false},true));
  dialog.addEventListener('cancel',event=>{event.preventDefault();navigate({sources:false},true);});
  dialog.addEventListener('click',event=>{const box=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom))navigate({sources:false},true);});
  window.addEventListener('popstate',render);
  render();
  new ResizeObserver(renderChart).observe($('trend-chart'));
})();
