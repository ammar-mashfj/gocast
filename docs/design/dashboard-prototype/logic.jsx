
class Component extends DCLogic {
  static T = [
    ['Midnight Signal','The Low Tides',180],['Harbour Lights','Ada Mensah',193],['Slow Burn','Velvet Transit',206],['Paper Moons','June Okoro',219],
    ['Neon Rain','Koto Blue',232],['Afterglow','The Low Tides',245],['Static Hearts','Mira Sol',258],['Last Train Home','Velvet Transit',271],
    ['Quiet Hours','Ada Mensah',284],['Blue Frequencies','Koto Blue',297],['Soft Machines','Mira Sol',310],['Dawn Chorus','June Okoro',323]
  ];
  static SW = { main:'#F4F1EC', jazz:'#9B7BFF', morning:'#C9B8FF' };
  static DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  static NOTES = {
    overview: [
      'A status band sits under the top bar on every page: grey off air, violet for AutoDJ, red only while you’re live — the app’s core colour rule, now on web.',
      'The hero says what’s happening and what pressing the button will do. One primary action per state; the hero turns violet or red with the station.',
      'Listening now reads like a meter (mono, big) and sits inside the hero instead of a separate card.',
      '“Coming up” pulls from Schedule so you know what plays when you walk away.',
      'Your link shows gocast.fm, not localhost. Copy is the first action; QR, Embed and Share follow.',
      'Setup checklist names what’s left, can be hidden, and links straight to the fix. Show times are real (not 12:00 AM).'
    ],
    studio: [
      'Preflight opens with the consequence: AutoDJ hands over, then takes back.',
      'Your running order has “+ Add files” (real file picker), “From your library”, drag-and-drop and Remove — before and during the show.',
      'Checks run visibly. A failure is amber with a plain fix — red stays for “you’re live”. Toggle “failChecks” in Tweaks to see it.',
      'A full red 3-2-1 countdown before air, same as the app.',
      'The status band changes with you: deep red when you’re live with music, full red when the mic is open, amber SILENCE after 3 s of dead air (pause the music to see it).',
      '“Keep mic open” latches the mic (or press L); the band and pad stay red until you close it.',
      'The talk pad from the app, with Space as hold-to-talk on desktop. Music only disables the pad.',
      'Ending asks once, then shows “That’s a wrap.” with what happened.'
    ],
    autodj: [
      'AutoDJ on/off lives at the top of the page with a violet Switch — no need to go back to Overview.',
      'Playlist names show in full; the column was too narrow and cut them off.',
      'The track playing now is marked in violet. Search filters as you type.',
      'Actions are words (“Remove”, “Delete”) instead of icons you have to guess.',
      'Jingles: one Switch plus a two-way choice instead of radios and dropdowns.'
    ],
    schedule: [
      'Save state is green (saved) or amber (unsaved). It was red, which in GoCast means you’re live.',
      'Your live show times are dashed outlines marked YOU, not red blocks.',
      '“Right now” and “Your next show” say what’s playing in plain words.',
      'Click any empty hour to add a slot there. Days show dates, and the now-line marks today.'
    ],
    audience: [
      'The listening-time chart actually draws (it was empty). Hover a bar for the day.',
      'No emoji flags — country codes in mono, in line with the app’s no-emoji rule.',
      'The headline counts people listening now when the station is on air.',
      'Uses the system’s StatTile and Segmented.'
    ],
    broadcasts: [
      'Duration bars are off-white. Red is only for live-right-now; past shows aren’t live.',
      'Real start times and weekdays instead of “12:00 AM” on every row.',
      'Click a show to see when it peaked and what played.',
      'A one-line summary up top says what the numbers mean.'
    ],
    settings: [
      'Encoder details are folded under “Use your own DJ software” — most people go live from the browser.',
      'The troubleshooting essay is now four short questions you can open.',
      'Show-time days use neutral chips instead of red.',
      'Delete is a quiet outline at the bottom with a typed confirmation.'
    ],
    account: [
      'Pro shows as an amber card (amber = Pro in the system) with billing next to it.',
      'Profile fields use the system TextField.',
      'Delete forever stays disabled until you type your email.'
    ]
  };

  constructor(props){
    super(props);
    const p = props || {};
    this.state = {
      page:'overview', air: p.startState || 'off', step:'preflight', mode:'mic', micOpen:false, playing:true,
      checkIdx:0, failed:false, count:3, liveSec: p.startState==='live' ? 734 : 0, peak:12, listeners: p.startState==='live'?12:(p.startState==='autodj'?3:0),
      autoIdx:0, autoPos:62, liveIdx:0, livePos:20, tracksPlayed:0,
      modal:null, notifOpen:false, acctMenu:false, toast:'', copied:false, collapsed:false, drawer:false,
      notesOpen: (p.showNotes ?? true) && (typeof window==='undefined' || window.innerWidth>=1100), vw: typeof window!=='undefined'?window.innerWidth:1400,
      device: p.device || 'desktop', ...(p.device==='phone'?{vw:390}:p.device==='tablet'?{vw:820}:{}), runOrder:[0,1,2,3,4,5].map(i=>({title:Component.T[i][0],artist:Component.T[i][1],sec:Component.T[i][2]})), libSel:[], dragOver:false, phoneDay:(new Date().getDay()+6)%7,
      playlists:[{id:'main',name:'Main rotation',ids:[0,1,2,3,4,5,6,7,8,9,10,11],def:true},{id:'jazz',name:'Late Night Jazz',ids:[0,1,2,3,4,5]},{id:'morning',name:'Morning Soul',ids:[6,7,8,9,10,11]}],
      plSel:'main', query:'', plDraft:'',
      jinglesOn:true, jingleEvery:'30 min', jingles:[{name:'Station ID',file:'station-id.mp3',len:'0:08'},{name:'Top of the hour',file:'top-of-hour.mp3',len:'0:08'}],
      slots:[{id:1,name:'Breakfast',pl:'morning',from:6,to:10,days:[0,1,2,3,4]},{id:2,name:'After hours',pl:'jazz',from:22,to:24,days:[0,1,2,3,4,5,6]}],
      shows:[{name:'The Night Shift',h:21,dur:2,days:[4]},{name:'Sunday Slow Down',h:18,dur:1,days:[6]}],
      dirty:false, slotDraft:null,
      range:'30d', hoverIdx:null, howOpen:false,
      openShow:null,
      station:{name:'Night Shift Radio',genre:'Soul',desc:'Late-night soul, jazz and slow-burn electronica for the insomniacs.'}, draft:null,
      links:[], linkDraft:'', advOpen:false, tipOpen:null, keyShown:false,
      acct:{name:'Maya Okafor',email:'maya@nightshift.fm'}, acctSaved:{name:'Maya Okafor',email:'maya@nightshift.fm'},
      delTyped:'', unread:2, setupHidden:false, now: Date.now()
    };
  }

  componentDidMount(){
    this.iv = setInterval(()=>this.tick(),1000);
    this.onResize = ()=>{ const el=this.frameRef.current; const dev=this.state.device; const w=dev==='phone'?390:dev==='tablet'?820:(el?el.clientWidth:window.innerWidth); if(w&&w!==this.state.vw) this.setState({vw:w}); };
    window.addEventListener('resize',this.onResize); this.onResize();
    if(typeof ResizeObserver!=='undefined'){ this.ro=new ResizeObserver(()=>this.onResize()); const tryObs=()=>{ if(this.frameRef.current){ this.ro.observe(this.frameRef.current); this.onResize(); } else setTimeout(tryObs,100); }; tryObs(); }
    this.kd = (e)=>{ if(e.code!=='Space'||this.state.step!=='live'||this.state.page!=='studio'||this.state.mode!=='mic'||this.state.modal) return; if(/INPUT|TEXTAREA/.test(e.target.tagName)) return; e.preventDefault(); if(!this.state.micOpen) this.setState({micOpen:true}); };
    this.kl = (e)=>{ if(e.code!=='KeyL'||this.state.step!=='live'||this.state.page!=='studio'||this.state.mode!=='mic'||this.state.modal) return; if(/INPUT|TEXTAREA/.test(e.target.tagName)) return; this.setState(s=>({latched:!s.latched,micOpen:false})); };
    window.addEventListener('keydown',this.kl);
    this.ku = (e)=>{ if(e.code==='Space' && this.state.micOpen){ e.preventDefault(); this.setState({micOpen:false}); } };
    window.addEventListener('keydown',this.kd); window.addEventListener('keyup',this.ku);
    if(this.state.air==='live') this.setState({page:'overview', step:'live'});
  }
  componentDidUpdate(prev){
    if(prev.device!==this.props.device && this.props.device){ const d=this.props.device; this.setState({device:d,vw:d==='phone'?390:d==='tablet'?820:window.innerWidth},()=>setTimeout(()=>this.onResize(),50)); }
    if(prev.showNotes!==this.props.showNotes) this.setState({notesOpen:!!this.props.showNotes});
    if(prev.startState!==this.props.startState){ const a=this.props.startState||'off'; this.setState({air:a, step:a==='live'?'live':'preflight', listeners:a==='live'?12:a==='autodj'?3:0, liveSec:a==='live'?734:0}); }
  }
  frameRef = { current:null };
  fileRef = { current:null };
  setFrame = (el)=>{ this.frameRef.current = el || this.frameRef.current; if(el){ if(this.ro) this.ro.observe(el); if(this.onResize) this.onResize(); } };
  setFile = (el)=>{ if(el) this.fileRef.current = el; };
  addFiles(files){
    const list=[...(files||[])].filter(f=>/^audio\//.test(f.type)||/\.(mp3|m4a|aac|flac|ogg|wav)$/i.test(f.name));
    if(!list.length){ this.flash('Those aren’t audio files'); return; }
    const items=list.map(f=>{ const base=f.name.replace(/\.[^.]+$/,''); const parts=base.split(' - '); return {title:(parts[1]||parts[0]).trim(),artist:parts[1]?parts[0].trim():'Your file',sec:0,key:Math.random()}; });
    this.setState(s=>({runOrder:[...s.runOrder,...items],dragOver:false}));
    list.forEach((f,i)=>{ try{ const url=URL.createObjectURL(f); const a=new Audio(); a.preload='metadata'; a.onloadedmetadata=()=>{ const sec=Math.round(a.duration)||180; this.setState(s=>({runOrder:s.runOrder.map(r=>r.key===items[i].key?{...r,sec}:r)})); URL.revokeObjectURL(url); }; a.onerror=()=>this.setState(s=>({runOrder:s.runOrder.map(r=>r.key===items[i].key?{...r,sec:180}:r)})); a.src=url; }catch(e){} });
    this.flash(`${list.length} ${list.length===1?'file':'files'} added to your running order`);
  }
  componentWillUnmount(){ if(this.ro) this.ro.disconnect(); clearInterval(this.iv); clearTimeout(this.tt); clearTimeout(this.ct); window.removeEventListener('resize',this.onResize); window.removeEventListener('keydown',this.kd); window.removeEventListener('keyup',this.ku); }

  tick(){
    this.setState(s=>{
      const n = { now: Date.now() };
      const T = Component.T;
      if(s.air==='autodj'){ let pos=s.autoPos+1, idx=s.autoIdx; if(pos>=T[idx][2]){pos=0; idx=(idx+1)%12;} n.autoPos=pos; n.autoIdx=idx; }
      if(s.air==='live'){
        n.liveSec=s.liveSec+1;
        const audible = s.micOpen || s.latched || (s.playing && s.runOrder.length>0);
        n.silentSec = audible ? 0 : (s.silentSec||0)+1;
        const RO=s.runOrder;
        if(s.playing&&RO.length){ let pos=s.livePos+1, idx=s.liveIdx%RO.length; const len=RO[idx].sec||180; if(pos>=len){pos=0; idx=(idx+1)%RO.length; n.tracksPlayed=s.tracksPlayed+1;} n.livePos=pos; n.liveIdx=idx; }
        if(n.liveSec%6===0){ const l=Math.max(4,s.listeners+(Math.random()<.6?1:-1)); n.listeners=l; n.peak=Math.max(s.peak,l); }
      } else if(s.air==='autodj' && Date.now()%9===0){ n.listeners=Math.max(1,s.listeners+(Math.random()<.5?1:-1)); }
      return n;
    });
  }

  flash(t){ clearTimeout(this.tt); this.setState({toast:t}); this.tt=setTimeout(()=>this.setState({toast:''}),2200); }
  go(page){ this.setState({page, drawer:false, acctMenu:false, notifOpen:false}); const el=this.frameRef.current; if(el) el.scrollTop=0; if(typeof window!=='undefined') window.scrollTo(0,0); }
  fmt(sec){ sec=Math.max(0,Math.floor(sec)); const m=Math.floor(sec/60), s=sec%60; return m+':'+String(s).padStart(2,'0'); }
  clock(sec){ const h=Math.floor(sec/3600), m=Math.floor(sec%3600/60), s=sec%60; return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':'); }
  hm(sec){ const h=Math.floor(sec/3600), m=Math.floor(sec%3600/60); return h?`${h}h ${m}m`:`${m}m ${sec%60}s`; }
  hh(h){ return h>=24?'24:00':String(h).padStart(2,'0')+':00'; }
  rnd(seed){ let x=seed; return ()=>{ x=(x*9301+49297)%233280; return x/233280; }; }

  runChecks(){
    clearTimeout(this.ct);
    this.setState({step:'checking', checkIdx:0, failed:false});
    const fail = !!this.props.failChecks;
    const adv = (i)=>{ this.ct=setTimeout(()=>{
      if(fail && i===0){ this.setState({failed:true}); return; }
      if(i<2){ this.setState({checkIdx:i+1}); adv(i+1); }
      else { this.setState({checkIdx:3}); this.ct=setTimeout(()=>this.countdown(3),400); }
    },700); };
    adv(0);
  }
  countdown(n){
    this.setState({step:'countdown', count:n});
    this.ct=setTimeout(()=>{ if(n>1) this.countdown(n-1); else this.setState({step:'live', air:'live', liveSec:0, listeners:Math.max(3,this.state.listeners), peak:3, liveIdx:0, livePos:0, tracksPlayed:0, playing:true}); },900);
  }

  getPad(){
    const DS = typeof window!=='undefined' && window.GoCastDesignSystem_78b1a8;
    if(!DS || !DS.TalkPad) return null;
    if(!this._Pad){
      this._Pad = function LivePad(p){
        const [lv,setLv]=React.useState(0);
        React.useEffect(()=>{ const t=setInterval(()=>setLv(p.open?.55+Math.random()*.35:(p.music?.12+Math.random()*.18:0)),130); return ()=>clearInterval(t); },[p.open,p.music]);
        return React.createElement(DS.TalkPad,{state:p.disabled?'disabled':p.open?'open':'idle', level:lv, onPress:p.onPress, onRelease:p.onRelease, title:p.latched?'Mic is latched':undefined, hint:p.latched?'Tap the pad or “Close mic” to stop talking.':p.disabled?'You chose music only. Your running order plays straight through.':undefined, style:{minHeight:340,flex:1}});
      };
    }
    return this._Pad;
  }

  renderVals(){
    const s=this.state, T=Component.T, SW=Component.SW, DAYS=Component.DAYS;
    const narrow = s.vw<980, isPhone = s.vw<640;
    const padX = isPhone?'18px':'36px';
    const FR={desktop:{w:'100%',h:'calc(100vh - 56px)',r:'0',pad:'0',shadow:'none',label:'FULL WIDTH'},tablet:{w:'820px',h:'calc(100vh - 96px)',r:'28px',pad:'20px',shadow:'0 0 0 10px #181614, 0 30px 60px -20px rgba(0,0,0,.8)',label:'820 PX · TABLET'},phone:{w:'390px',h:'min(844px, calc(100vh - 96px))',r:'40px',pad:'20px',shadow:'0 0 0 10px #181614, 0 30px 60px -20px rgba(0,0,0,.8)',label:'390 PX · PHONE'}};
    const frame=FR[s.device]||FR.desktop;
    const pages=[['overview','Overview'],['studio','Studio'],['autodj','AutoDJ'],['schedule','Schedule'],['audience','Audience'],['broadcasts','Your shows'],['settings','Settings']];
    const nav = pages.map(([k,l])=>{
      const on=s.page===k;
      let hasDot=false,dotColor='',dotText='';
      if(k==='studio'&&s.air==='live'){hasDot=true;dotColor='#FF5A4E';dotText='LIVE';}
      if(k==='autodj'&&s.air==='autodj'){hasDot=true;dotColor='#9B7BFF';dotText='ON';}
      return {label:l, go:()=>this.go(k), bg:on?'#1D1A17':'transparent', color:on?'#F4F1EC':'#A39D94', font:on?'700 15px var(--font-body)':'500 15px var(--font-body)', hasDot, dotColor, dotText};
    });
    const crumbMap={overview:'',studio:'Studio',autodj:'AutoDJ',schedule:'Schedule',audience:'Audience',broadcasts:'Your shows',settings:'Settings',account:'Account'};
    const crumb=crumbMap[s.page];
    const nowD=new Date(s.now);
    const london=nowD.toLocaleString('en-GB',{weekday:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).replace(',','').toUpperCase();
    const lh = parseInt(nowD.toLocaleString('en-GB',{hour:'2-digit',hour12:false,timeZone:'Europe/London'}),10)%24;
    const lm = parseInt(nowD.toLocaleString('en-GB',{minute:'2-digit',timeZone:'Europe/London'}),10);
    const todayIdx=(nowD.getDay()+6)%7;

    const cur=T[s.autoIdx], nxt=T[(s.autoIdx+1)%12];
    const goLive=()=>{ this.go('studio'); if(s.air!=='live') this.setState({step:'preflight'}); };
    let band;
    const micOn = s.micOpen || s.latched;
    const silent = s.air==='live' && !micOn && (s.silentSec||0)>=3;
    const liveBase={showTimer:true,listen:`${s.listeners} LISTENING`,hasAction:s.page!=='studio',actionLabel:'Open studio',action:()=>this.go('studio'),dot:'#FF5A4E',sideColor:'#FF8A80'};
    if(s.air==='live' && micOn) band={...liveBase,bg:'#FF5A4E',ink:'#1A0806',lamp:'mic',lampVariant:'solid',lampText:'LIVE · MIC',text:s.latched?'Mic latched open. Everyone hears you until you close it.':'Your mic is open. Everyone hears you.',btnBg:'#1A0806',btnInk:'#FF5A4E'};
    else if(silent) band={...liveBase,bg:'#FFB547',ink:'#1A1206',lamp:'silence',lampVariant:'solid',lampText:'SILENCE',text:`Listeners hear nothing for ${s.silentSec} s. Play a track or open the mic.`,hasAction:true,actionLabel:s.runOrder.length?'Play music':'Add files',action:()=>{ if(this.state.runOrder.length) this.setState({playing:true}); else { this.go('studio'); this.flash('Add files to your running order'); } },btnBg:'#1A1206',btnInk:'#FFB547',dot:'#FFB547',sideColor:'#FFD48A'};
    else if(s.air==='live') band={...liveBase,bg:'#3A1714',ink:'#FFB3AC',lamp:'live',lampVariant:'solid',lampText:'LIVE',text:s.mode==='mic'?'You’re live. Music is playing — hold the pad or Space to talk.':'You’re live with music only.',btnBg:'#FF5A4E',btnInk:'#1A0806'};
    else if(s.air==='autodj') band={bg:'#1E1A2B',ink:'#F4F1EC',lamp:'onair',lampVariant:'soft',lampText:'ON AIR · AUTODJ',text:`AutoDJ is playing ${cur[0]} by ${cur[1]}.`,showTimer:false,listen:`${s.listeners} LISTENING`,hasAction:true,actionLabel:'Go live',action:goLive,btnBg:'#F4F1EC',btnInk:'#0E0D0C',dot:'#9B7BFF',sideColor:'#C9B8FF'};
    else band={bg:'#181614',ink:'#F4F1EC',lamp:'off',lampVariant:'soft',lampText:'OFF AIR',text:'Nothing’s playing. Nobody can tune in right now.',showTimer:false,listen:'',hasAction:true,actionLabel:'Start AutoDJ',action:()=>{this.setState({air:'autodj',listeners:2});this.flash('AutoDJ is on. Main rotation is playing.');},btnBg:'rgba(155,123,255,.18)',btnInk:'#C9B8FF',dot:'#6F6A63',sideColor:'#A39D94'};

    let hero;
    if(s.air==='live') hero={bg:'#FF5A4E',bg2:'#FF6A5F',gap:'#4A1510',ink:'#1A0806',sub:'#4A1510',lampVariant:'solid',title:'You’re live.',text:'Listeners hear you about 15 seconds late. It’s safe to lock your phone or switch tabs.',listenText:`Peak tonight: ${s.peak}.`};
    else if(s.air==='autodj') hero={bg:'#1E1A2B',bg2:'#1E1A2B',gap:'#0E0D0C',ink:'#F4F1EC',sub:'#A39D94',lampVariant:'soft',title:'Your station is playing itself.',text:'AutoDJ is on Main rotation. It hands over when you go live, and takes back when you end.',listenText:'People on your player page and the direct stream.'};
    else hero={bg:'#181614',bg2:'#181614',gap:'#0E0D0C',ink:'#F4F1EC',sub:'#A39D94',lampVariant:'soft',title:'Nothing’s playing right now.',text:'Nobody can tune in. Start AutoDJ to play your music, or go live yourself.',listenText:'Start AutoDJ or go live to start counting.'};

    const link='gocast.fm/night-shift-radio';
    const btnS={size:'m',full:false,style:{height:40,borderRadius:14,font:'700 14px var(--font-body)',padding:'0 16px'}};

    // upcoming
    const nextSlot=s.slots.filter(x=>x.days.includes(todayIdx)&&x.from>lh).sort((a,b)=>a.from-b.from)[0];
    const upcoming=[];
    const nowSlotObj=s.slots.find(x=>x.days.includes(todayIdx)&&lh>=x.from&&lh<x.to);
    upcoming.push({when:'NOW',title:nowSlotObj?nowSlotObj.name:'Main rotation',meta:s.air==='off'?'Plays once you start AutoDJ':(s.air==='live'?'Paused while you’re live':'AutoDJ'),color:nowSlotObj?SW[nowSlotObj.pl]:'#F4F1EC'});
    if(nextSlot){ const pl=s.playlists.find(p=>p.id===nextSlot.pl); upcoming.push({when:this.hh(nextSlot.from),title:nextSlot.name,meta:`${pl?pl.name:''} until ${this.hh(nextSlot.to)}`,color:SW[nextSlot.pl]||'#9B7BFF'}); }
    let ns=null; for(let k=0;k<8&&!ns;k++){ const di=(todayIdx+k)%7; const c=s.shows.filter(x=>x.days.includes(di)&&(k>0||x.h>lh)).sort((a,b)=>a.h-b.h)[0]; if(c) ns={...c,k,di}; }
    if(ns) upcoming.push({when:(ns.k===0?'TODAY ':DAYS[ns.di].toUpperCase()+' ')+this.hh(ns.h).slice(0,5),title:ns.name,meta:'Your live show · you start it from the studio',color:'rgba(244,241,236,.4)'});

    // activity
    const actVals=[0,90,0,74,0,81,0,88,0,95,0,0,67,0];
    const activity=actVals.map((v,i)=>({h:v?(v/100*100)+'%':'3px',bg:v?(i===12?'#F4F1EC':'#A39D94'):'#221F1C',tip:v?`${v} min live`:'No show'}));

    // broadcasts
    const bc=[['Tue 30 Sep','21:04','Studio',67,8,'21:41',14],['Sun 28 Sep','18:00','Studio',74,11,'18:52',15],['Fri 26 Sep','21:02','Own software',81,14,'22:10',18],['Wed 24 Sep','22:15','Studio',88,17,'23:01',19],['Mon 22 Sep','21:30','Studio',95,20,'22:12',21],['Sat 20 Sep','20:00','Own software',102,23,'21:05',22],['Thu 18 Sep','21:00','Studio',109,26,'21:48',24],['Tue 16 Sep','21:00','Studio',116,29,'22:20',26],['Sun 14 Sep','18:00','Own software',123,32,'19:12',28],['Fri 12 Sep','21:00','Studio',130,35,'22:30',30]];
    const hmm=(m)=>`${Math.floor(m/60)}h ${m%60}m`;
    const shows=bc.map((b,i)=>({day:b[0],time:b[1]+' – '+(()=>{const [h,mm]=b[1].split(':').map(Number);const t=h*60+mm+b[3];return String(Math.floor(t/60)%24).padStart(2,'0')+':'+String(t%60).padStart(2,'0');})(),src:b[2],dur:hmm(b[3]),w:(b[3]/130*100)+'%',peak:b[4],peakAt:b[5],tracks:b[6],open:s.openShow===i,bg:s.openShow===i?'#1D1A17':'transparent',toggle:()=>this.setState({openShow:s.openShow===i?null:i})}));
    const recent=bc.slice(0,5).map(b=>({day:b[0],time:b[1],src:b[2],dur:hmm(b[3]),peak:b[4]}));

    // studio
    const st={preflight:s.step==='preflight',checking:s.step==='checking',countdown:s.step==='countdown',live:s.step==='live',wrap:s.step==='wrap',failed:s.failed};
    const modeCard=(on)=>on?{bg:'#F4F1EC',ink:'#0E0D0C',sub:'#6F6A63',tag:'SELECTED'}:{bg:'#181614',ink:'#F4F1EC',sub:'#A39D94',tag:'TAP TO CHOOSE'};
    const queue=s.runOrder.map((r,n)=>({n:n+1,title:r.title,artist:r.artist,len:r.sec?this.fmt(r.sec):'…',remove:()=>this.setState(x=>({runOrder:x.runOrder.filter((_,j)=>j!==n)}))}));
    const checkLabels=['Checking your connection','Bringing your station on air','Setting up the audio'];
    const checks=checkLabels.map((l,i)=>{
      const failedHere=s.failed&&i===0, done=!s.failed&&i<s.checkIdx, running=!s.failed&&i===s.checkIdx;
      return {label:l,border:i?'1px solid rgba(244,241,236,.06)':'0',glyph:failedHere?'!':done?'✓':running?'…':'',bg:failedHere?'#FFB547':done?'#5FD39A':running?'#2A2723':'#221F1C',ink:failedHere?'#1A1206':done?'#0E0D0C':'#F4F1EC',color:failedHere?'#FFD48A':(done||running)?'#F4F1EC':'#6F6A63',state:failedHere?'FAILED':done?'OK':running?'CHECKING':'WAITING'};
    });
    const RO=s.runOrder, nRO=RO.length, li=nRO?s.liveIdx%nRO:0;
    const removeAt=(i)=>()=>this.setState(x=>{ const r=x.runOrder.filter((_,j)=>j!==i); let idx=x.liveIdx; if(i<idx) idx--; return {runOrder:r, liveIdx:Math.max(0,r.length?idx%r.length:0)}; });
    const lc=nRO?RO[li]:null, lcLen=lc?(lc.sec||180):1;
    const liveNow=lc?{title:lc.title,artist:lc.artist,left:this.fmt(lcLen-s.livePos),progress:s.livePos/lcLen,next:nRO>1?RO[(li+1)%nRO].title:'Nothing queued',count:Math.max(0,nRO-1),playing:s.playing}:{title:'Nothing queued',artist:'Add files to play music under your voice',left:'0:00',progress:0,next:'—',count:0,playing:false};
    const liveQueue=[]; for(let k=1;k<Math.min(nRO,6);k++){ const j=(li+k)%nRO; const t=RO[j]; liveQueue.push({title:t.title,artist:t.artist,len:t.sec?this.fmt(t.sec):'…',remove:removeAt(j)}); }
    const totalSec=RO.reduce((a,r)=>a+(r.sec||0),0);
    const lib=s.libSel;
    const libRows=T.map((t,i)=>{const on=lib.includes(i);return {title:t[0],artist:t[1],len:this.fmt(t[2]),mark:on?'✓':'',boxBg:on?'#F4F1EC':'#2A2723',toggle:()=>this.setState(x=>({libSel:x.libSel.includes(i)?x.libSel.filter(z=>z!==i):[...x.libSel,i]}))};});
    const Pad=this.getPad();
    const talkPad=Pad?React.createElement(Pad,{open:micOn,latched:s.latched,music:s.playing&&s.runOrder.length>0,disabled:s.mode==='music',onPress:()=>{ if(this.state.latched) this.setState({latched:false,micOpen:false}); else this.setState({micOpen:true}); },onRelease:()=>{ if(this.state.micOpen) this.setState({micOpen:false}); }}):null;

    // autodj
    const curPl=s.plSel==='all'?null:s.playlists.find(p=>p.id===s.plSel);
    const ids=curPl?curPl.ids:T.map((_,i)=>i);
    const q=s.query.trim().toLowerCase();
    const playingId=s.air==='autodj'?s.autoIdx:(s.air==='live'?s.liveIdx:-1);
    const rows=ids.map((id,n)=>({id,n})).filter(({id})=>!q||(T[id][0]+' '+T[id][1]).toLowerCase().includes(q)).map(({id,n})=>{
      const playing=id===playingId;
      return {num:playing?'▶':n+1,numColor:playing?'#9B7BFF':'#6F6A63',title:T[id][0],titleColor:playing?'#C9B8FF':'#F4F1EC',artist:T[id][1],len:this.fmt(T[id][2]),bg:playing?'#1E1A2B':'transparent',
        chips:curPl?['Added Oct 1']:s.playlists.filter(p=>p.ids.includes(id)).map(p=>p.name),
        removeLabel:curPl?'Remove':'Delete',
        remove:()=>{ if(curPl){ this.setState(st2=>({playlists:st2.playlists.map(p=>p.id===curPl.id?{...p,ids:p.ids.filter(x=>x!==id)}:p)})); this.flash(`Removed from ${curPl.name}`);} else this.flash('Deleting tracks is disabled in this prototype'); }};
    });
    const plMins=(p)=>Math.round(p.ids.reduce((a,i)=>a+T[i][2],0)/60);
    const plList=s.playlists.map(p=>({name:p.name,meta:`${p.ids.length} · ${plMins(p)}m`,swatch:SW[p.id]||'#6F6A63',bg:s.plSel===p.id?'#1D1A17':'transparent',color:s.plSel===p.id?'#F4F1EC':'#A39D94',sel:()=>this.setState({plSel:p.id,query:''})}));
    const plHead=curPl?{name:curPl.name,isDefault:!!curPl.def,meta:`${curPl.ids.length} tracks · ${plMins(curPl)} min · plays in order, then loops`}:{name:'All tracks',isDefault:false,meta:'Everything you’ve uploaded. A track can be in any number of playlists.'};
    let autoStrip;
    if(s.air==='autodj') autoStrip={bg:'#1E1A2B',lamp:'onair',label:'ON AIR · AUTODJ',text:`Playing ${cur[0]} · ${this.fmt(cur[2]-s.autoPos)} left. Next: ${nxt[0]}.`};
    else if(s.air==='live') autoStrip={bg:'#181614',lamp:'live',label:'YOU’RE LIVE',text:'AutoDJ is paused while you’re live. It takes back when you end the show.'};
    else autoStrip={bg:'#181614',lamp:'off',label:'AUTODJ OFF',text:'Turn AutoDJ on to keep the station playing when you step away.'};

    // schedule
    const hours=[0,3,6,9,12,15,18,21,24].map(h=>({label:this.hh(h).slice(0,5),left:(h/24*100)+'%'}));
    const mon=new Date(nowD); mon.setDate(nowD.getDate()-todayIdx);
    const week=DAYS.map((d,i)=>{
      const dt=new Date(mon); dt.setDate(mon.getDate()+i);
      const daySlots=s.slots.filter(x=>x.days.includes(i)), dayShows=s.shows.filter(x=>x.days.includes(i));
      const pickOn=s.phoneDay===i;
      return {num:dt.getDate(),pick:()=>this.setState({phoneDay:i}),pickBg:pickOn?'#F4F1EC':'transparent',pickInk:pickOn?'#0E0D0C':(i===todayIdx?'#F4F1EC':'#A39D94'),
        dots:[...dayShows.map(()=>'#A39D94'),...daySlots.map(x=>SW[x.pl]||'#6F6A63')].slice(0,3),
        label:d.toUpperCase(),date:dt.toLocaleDateString('en-GB',{day:'numeric',month:'short'}).toUpperCase(),isToday:i===todayIdx,labelColor:i===todayIdx?'#F4F1EC':'#A39D94',bg:i===todayIdx?'#1D1A17':'#0E0D0C',
        add:(e)=>{ const r=e.currentTarget.getBoundingClientRect(); const h=Math.max(0,Math.min(23,Math.floor((e.clientX-r.left)/r.width*24))); this.setState({modal:'slot',slotDraft:{id:null,name:'',pl:'jazz',from:h,to:Math.min(24,h+1),days:[i]}}); },
        slots:s.slots.filter(x=>x.days.includes(i)).map(x=>({name:x.name,time:`${this.hh(x.from)}–${this.hh(x.to)}`,left:(x.from/24*100)+'%',width:`calc(${(x.to-x.from)/24*100}% - 2px)`,bg:SW[x.pl]||'#6F6A63',ink:x.pl==='jazz'?'#0E0D0C':'#1E1A2B',tip:`${x.name} · ${this.hh(x.from)}–${this.hh(x.to)}`,edit:(e)=>{e.stopPropagation(); this.setState({modal:'slot',slotDraft:{...x,days:[...x.days]}});}})),
        shows:s.shows.filter(x=>x.days.includes(i)).map(x=>({left:(x.h/24*100)+'%',width:(x.dur/24*100)+'%',tip:`${x.name} — you, live`}))};
    });
    const nowLeft=((lh*60+lm)/1440*100)+'%';
    const pd=s.phoneDay;
    const dayList=[...s.slots.filter(x=>x.days.includes(pd)).map(x=>{const pl=s.playlists.find(p=>p.id===x.pl);return {sort:x.from,time:`${this.hh(x.from)} – ${this.hh(x.to)}`,name:x.name,meta:`${pl?pl.name:''} · ${pl?pl.ids.length:0} tracks`,color:SW[x.pl]||'#6F6A63',edit:()=>this.setState({modal:'slot',slotDraft:{...x,days:[...x.days]}})};}),
      ...s.shows.filter(x=>x.days.includes(pd)).map(x=>({sort:x.h,time:`${this.hh(x.h)} – ${this.hh(x.h+x.dur)}`,name:x.name,meta:'Your live show · start it from the studio',color:'rgba(244,241,236,.4)',edit:()=>this.go('settings')}))].sort((a,b)=>a.sort-b.sort);
    const nsPl=nowSlotObj?s.playlists.find(p=>p.id===nowSlotObj.pl):null;
    const nowSlot=s.air==='off'?{title:'Your station is off.',sub:`When it’s on, AutoDJ plays ${nowSlotObj?nowSlotObj.name+' ('+(nsPl?nsPl.name:'')+')':'Main rotation'}.`}:s.air==='live'?{title:'You’re live.',sub:'The schedule waits until you end your show.'}:{title:nowSlotObj?`${nowSlotObj.name} — ${nsPl?nsPl.name:''}`:'Main rotation',sub:nowSlotObj?`Until ${this.hh(nowSlotObj.to)}, then Main rotation.`:(nextSlot?`Until ${this.hh(nextSlot.from)}, when ${nextSlot.name} starts.`:'Until the end of the day.')};
    const nextShow=ns?{title:ns.name,sub:`${ns.k===0?'Today':ns.k===1?'Tomorrow':['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][ns.di]} at ${this.hh(ns.h).slice(0,5)}. You start it from the studio.`}:{title:'None planned',sub:'Add show times in Settings.'};
    const save=s.dirty?{color:'#FFB547',label:'UNSAVED CHANGES',clean:false}:{color:'#5FD39A',label:'ALL SAVED',clean:true};

    const sd=s.slotDraft;
    const slot=sd?{name:sd.name,fromText:this.hh(sd.from),toText:this.hh(sd.to),isEdit:!!sd.id,invalid:!sd.name.trim()||sd.to<=sd.from||!sd.days.length,deleteLabel:sd.days.length>1?`Delete on all ${sd.days.length} days`:'Delete'}:{};
    const slotPls=s.playlists.map(p=>({name:p.name+(p.def?' (default)':''),meta:`${p.ids.length} tracks`,swatch:SW[p.id]||'#6F6A63',bg:sd&&sd.pl===p.id?'#2A2723':'transparent',sel:()=>this.setState(x=>({slotDraft:{...x.slotDraft,pl:p.id}}))}));
    const slotDays=['Mo','Tu','We','Th','Fr','Sa','Su'].map((l,i)=>{const on=sd&&sd.days.includes(i);return {label:l,bg:on?'#9B7BFF':'#221F1C',ink:on?'#0E0D0C':'#A39D94',toggle:()=>this.setState(x=>{const d=x.slotDraft.days;return {slotDraft:{...x.slotDraft,days:d.includes(i)?d.filter(z=>z!==i):[...d,i].sort()}};})};});
    const bump=(k,dlt)=>()=>this.setState(x=>({slotDraft:{...x.slotDraft,[k]:Math.max(0,Math.min(24,x.slotDraft[k]+dlt))}}));

    // audience
    const R={ '7d':{n:7,time:'42h 42m',daily:78,peak:4,avg:'33m 21s',fin:78,from:'SEP 25',seed:7},'30d':{n:30,time:'71h 05m',daily:131,peak:6,avg:'32m 40s',fin:131,from:'SEP 2',seed:30},'90d':{n:90,time:'84h 30m',daily:160,peak:6,avg:'32m 11s',fin:160,from:'JUL 4',seed:90} }[s.range];
    const rand=this.rnd(R.seed*13+5); const vals=[];
    for(let i=0;i<R.n;i++){ const growth=s.range==='90d'?(i/R.n):1; vals.push(Math.round((20+rand()*90)*(0.25+growth*.75)*((i%7===4||i%7===6)?1.6:1))); }
    const mx=Math.max(...vals);
    const startDate=new Date(nowD); startDate.setDate(nowD.getDate()-(R.n-1));
    const bars=vals.map((v,i)=>({h:(v/mx*100)+'%',bg:s.hoverIdx===i?'#F4F1EC':(i===R.n-1?'#C9B8FF':'#6F6A63'),hover:()=>this.setState({hoverIdx:i})}));
    let hoverDay='Hover a bar';
    if(s.hoverIdx!=null&&s.hoverIdx<R.n){ const d=new Date(startDate); d.setDate(startDate.getDate()+s.hoverIdx); const v=vals[s.hoverIdx]; hoverDay=d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}).toUpperCase()+` · ${Math.floor(v/60)}H ${v%60}M`; }
    const c7=[['BR','Brazil','9h 2m',18],['CA','Canada','5h 16m',15],['GB','United Kingdom','8h 1m',15],['FR','France','5h 28m',14],['NG','Nigeria','6h 54m',14],['DE','Germany','3h 11m',12],['US','United States','5h 26m',12]];
    const c90=[['FR','France','15h 20m',18],['CA','Canada','13h 17m',16],['BR','Brazil','15h',16],['DE','Germany','7h 36m',14],['NG','Nigeria','12h 8m',13],['GB','United Kingdom','10h 44m',12],['US','United States','11h 40m',11]];
    const cs=s.range==='7d'?c7:c90;
    const mk=(arr,code)=>{const m=Math.max(...arr.map(a=>a[a.length-1]));return arr.map(a=>({hasCode:!!code,code:code?a[0]:'',name:code?a[1]:a[0],val:code?`${a[2]} · ${a[3]}%`:`${a[1]}%`,w:(a[a.length-1]/m*100)+'%'}));};
    const breakdowns=[
      {title:'Countries',rows:mk(cs,true),foot:`Placed ${R.fin} of ${R.fin} listens.`},
      {title:'Devices',rows:mk(s.range==='7d'?[['Phone',37],['Computer',35],['Tablet',28]]:[['Phone',38],['Tablet',33],['Computer',29]]),foot:'Phones lead — most people listen in bed or on the move.'},
      {title:'Browsers',rows:mk(s.range==='7d'?[['Firefox',37],['Safari',33],['Chrome',29]]:[['Firefox',41],['Safari',33],['Chrome',26]]),foot:'Your player works the same in all of them.'},
      {title:'Where they came from',rows:mk(s.range==='7d'?[['google.com',60],['reddit.com',40]]:[['google.com',65],['reddit.com',35]]),foot:'Only the site name is recorded, never the full address.'}
    ];
    const listenNow=s.air==='off'?'—':String(s.listeners);
    const aud={headline:s.air==='off'?'Audience':`${s.listeners} ${s.listeners===1?'person is':'people are'} listening.`,time:R.time,timeSub:`everyone, last ${R.n} days`,daily:R.daily,peak:R.peak,avg:R.avg,avgSub:`across ${R.fin} finished listens`,bars,from:R.from,breakdowns,gap:R.n>60?'2px':R.n>20?'4px':'10px',radius:R.n>60?'2px':'6px'};

    // settings
    const streamRows=[
      {k:'PLAYER PAGE',v:'https://'+link,note:'The link to share. Listeners press play here.',copy:()=>this.flash('Link copied')},
      {k:'DIRECT STREAM',v:'https://stream.gocast.fm/night-shift-radio',note:'For radio apps and smart speakers. Works only while you’re on air.',copy:()=>this.flash('Stream address copied')},
      {k:'QUALITY',v:'MP3 · 128 kbps · 44.1 kHz',note:'The same for every station.',copy:()=>this.flash('Copied')}
    ];
    const encRows=[['Server','ingest.gocast.fm'],['Port','8010'],['Mount','/night-shift-radio'],['Username','source'],['Password',s.keyShown?'nsr-8f3k-22pq-x1vd':'••••••••••••••••']].map(([k,v])=>({k,v,action:k==='Password'?(s.keyShown?'Hide':'Show'):'Copy',copy:k==='Password'?()=>this.setState({keyShown:!s.keyShown}):()=>this.flash(`${k} copied`)}));
    const tipsData=[['Turn the station on first?','Yes. Start AutoDJ on Overview, then connect. Your software connects to the station itself, so there’s nothing to connect to while it’s off air.'],['Shoutcast doesn’t work?','Shoutcast can’t send the Mount value, so it never reaches your station. Choose Icecast 2 even if your software defaults to Shoutcast.'],['Does a new key kick me off?','No. A show already on air keeps running; the new key applies next time your software connects.'],['Is this connection private?','Not encrypted. Your software sends the key as plain text, so make a new one if you ever paste it somewhere public.']];
    const tips=tipsData.map((t,i)=>({q:t[0],a:t[1],open:s.tipOpen===i,glyph:s.tipOpen===i?'−':'+',toggle:()=>this.setState({tipOpen:s.tipOpen===i?null:i})}));
    const showTimes=s.shows.map((x,si)=>({name:x.name,time:this.hh(x.h).slice(0,5)+' · '+x.dur+'h',days:['Mo','Tu','We','Th','Fr','Sa','Su'].map((l,i)=>{const on=x.days.includes(i);return {label:l,bg:on?'#F4F1EC':'#221F1C',ink:on?'#0E0D0C':'#A39D94',toggle:()=>this.setState(st2=>({shows:st2.shows.map((y,yi)=>yi!==si?y:{...y,days:y.days.includes(i)?y.days.filter(z=>z!==i):[...y.days,i]})}))};})}));
    const links=s.links.map((u,i)=>({url:u,remove:()=>this.setState(x=>({links:x.links.filter((_,j)=>j!==i)}))}));
    const addLink=()=>{ const v=this.state.linkDraft.trim(); if(!v) return; this.setState(x=>({links:[...x.links,v],linkDraft:''})); this.flash('Link added to your player page'); };

    // modal
    const modalDefs={
      edit:{title:'Edit station',sub:'How your station looks on its player page.'},
      qr:{title:'Tune-in code',sub:`Point a phone camera at it to open ${s.station.name}. Put it on a poster, a flyer, or the end of a set.`},
      embed:{title:'Embed on your site',sub:'Paste this where you want the player to appear.'},
      share:{title:'Share your station',sub:'Send people straight to your player page.'},
      newPl:{title:'New playlist',sub:'A set of tracks with its own play order. Fill it from your library, or upload straight into it.'},
      jingles:{title:'Jingles',sub:'Short clips AutoDJ plays between songs, like “You’re listening to…”. They never cut into a song.'},
      slot:{title:sd&&sd.id?'Edit slot':'New slot',sub:'What AutoDJ plays in this stretch. Press Save on the page to keep it.'},
      library:{title:'Add from your library',sub:'Pick tracks to add to the end of your running order.'},
      endShow:{title:'End your show?',sub:`You’ve been on for ${this.hm(s.liveSec)}. AutoDJ takes back the station straight away.`},
      delAcct:{title:'Delete your account?',sub:'This is permanent and can’t be undone.'},
      delStation:{title:'Delete Night Shift Radio?',sub:'This is permanent and can’t be undone.'}
    };
    const md=modalDefs[s.modal]||{title:'',sub:''};
    const isDel=s.modal==='delAcct'||s.modal==='delStation';
    const delTarget=s.modal==='delAcct'?s.acct.email:'night-shift-radio';
    const delOk=s.delTyped.trim()===delTarget;
    const qr=[]; { const rq=this.rnd(42); for(let y=0;y<21;y++)for(let x=0;x<21;x++){ const f=(a,b)=>x>=a&&x<a+7&&y>=b&&y<b+7; let on; const fin=(a,b)=>{const dx=x-a,dy=y-b;return (dx===0||dx===6||dy===0||dy===6)||(dx>=2&&dx<=4&&dy>=2&&dy<=4);}; if(f(0,0))on=fin(0,0); else if(f(14,0))on=fin(14,0); else if(f(0,14))on=fin(0,14); else on=rq()<.5; qr.push(on?'#0E0D0C':'transparent'); } }

    const notes=(Component.NOTES[s.page]||[]).map((t,i)=>({n:String(i+1).padStart(2,'0'),text:t}));

    return {
      showSidebar:!narrow&&!s.collapsed, drawerOpen:narrow&&s.drawer, padX, nav, station:s.station, stationUpper:s.station.name.toUpperCase(),
      band, hero, link, btnS, upcoming, activity, recent, shows,
      hasCrumb:!!crumb, crumb, crumbUpper:(crumb||'Overview').toUpperCase(), clockText:london+' · LONDON',
      liveClock:this.clock(s.liveSec), liveClockShort:this.hm(s.liveSec), listenNow, peakText:`peak ${s.peak}`,
      isOverview:s.page==='overview', isStudio:s.page==='studio', isAutodj:s.page==='autodj', isSchedule:s.page==='schedule', isAudience:s.page==='audience', isBroadcasts:s.page==='broadcasts', isSettings:s.page==='settings', isAccount:s.page==='account',
      isOff:s.air==='off', isAuto:s.air==='autodj', isLive:s.air==='live',
      now:{title:cur[0],artist:cur[1],left:this.fmt(cur[2]-s.autoPos),pct:(s.autoPos/cur[2]*100)+'%',next:`${nxt[0]} · ${nxt[1]}`},
      setupLeft:!s.setupHidden, dismissSetup:()=>this.setState({setupHidden:true}),
      copyLabel:s.copied?'Copied':'Copy', copyLink:()=>{ try{navigator.clipboard.writeText('https://'+link);}catch(e){} this.setState({copied:true}); this.flash('Link copied'); setTimeout(()=>this.setState({copied:false}),1800); },
      // nav/actions
      goOverview:()=>this.go('overview'), goStudio:()=>this.go('studio'), goAudience:()=>this.go('audience'), goSchedule:()=>this.go('schedule'), goSettings:()=>this.go('settings'), goBroadcasts:()=>this.go('broadcasts'), goAccount:()=>this.go('account'),
      goLive, startAuto:()=>{this.setState({air:'autodj',listeners:2});this.flash('AutoDJ is on. Main rotation is playing.');}, stopAuto:()=>{this.setState({air:'off',listeners:0});this.flash('AutoDJ stopped. You’re off air.');},
      toggleAuto:(v)=>{ if(s.air==='live') return; this.setState({air:v?'autodj':'off',listeners:v?2:0}); this.flash(v?'AutoDJ is on.':'AutoDJ stopped. You’re off air.'); },
      toggleSidebar:()=>narrow?this.setState({drawer:!s.drawer}):this.setState({collapsed:!s.collapsed}), closeDrawer:()=>this.setState({drawer:false}),
      toggleAccountMenu:()=>this.setState({acctMenu:!s.acctMenu}), accountMenuOpen:s.acctMenu,
      toastHelp:()=>{this.setState({acctMenu:false});this.flash('Help opens in a new tab');}, toastSignOut:()=>{this.setState({acctMenu:false});this.flash('Signed out (not really — it’s a prototype)');},
      notifOpen:s.notifOpen, toggleNotif:()=>this.setState({notifOpen:!s.notifOpen}), hasUnread:s.unread>0, unread:s.unread, markRead:()=>this.setState({unread:0}),
      notifs:[{title:'Breakfast starts at 06:00',body:'AutoDJ switches to Morning Soul until 10:00.',when:'TODAY',dot:s.unread?'#C9B8FF':'#2A2723'},{title:'Your Sep 30 show peaked at 8',body:'21:41, about 37 minutes in. 0 s of audio lost.',when:'YESTERDAY',dot:s.unread?'#F4F1EC':'#2A2723'}],
      notesClosed:!s.notesOpen, notesMaxH:s.vw<1100?'38vh':'60vh', notesVisible:s.notesOpen&&notes.length>0, notes, openNotes:()=>this.setState({notesOpen:true}), closeNotes:()=>this.setState({notesOpen:false}),
      hasToast:!!s.toast, toast:s.toast,
      // studio
      st, count:s.count, modeMic:modeCard(s.mode==='mic'), modeMusic:modeCard(s.mode==='music'), setMic:()=>this.setState({mode:'mic'}), setMusic:()=>this.setState({mode:'music'}),
      queue, queueMeta:`${nRO} ${nRO===1?'TRACK':'TRACKS'} · ${Math.round(totalSec/60)} MIN`, runChecks:()=>this.runChecks(), retryChecks:()=>this.runChecks(), backPreflight:()=>{clearTimeout(this.ct);this.setState({step:'preflight',failed:false});},
      checks, checkTitle:s.failed?`${s.station.name} didn’t go live`:'Getting you on air…',
      cancelCountdown:()=>{clearTimeout(this.ct);this.setState({step:'preflight'});this.flash('Cancelled. Nothing went out.');},
      talkPad, padHint:s.mode!=='mic'?'Music only — the mic stays closed.':s.latched?'Latched. Press L or tap the pad to close.':'Hold the pad or Space to talk. Press L to latch.',
      isMicMode:s.mode==='mic', latched:!!s.latched, notLatched:!s.latched,
      latchMic:()=>this.setState({latched:true,micOpen:false}), unlatchMic:()=>this.setState({latched:false,micOpen:false}),
      liveNow, liveQueue, togglePlay:()=>this.setState({playing:!s.playing}), skipTrack:()=>this.setState(x=>({liveIdx:x.runOrder.length?(x.liveIdx+1)%x.runOrder.length:0,livePos:0,tracksPlayed:x.tracksPlayed+1})),
      askEnd:()=>this.setState({modal:'endShow'}), endShow:()=>this.setState({modal:null,step:'wrap',air:'autodj',micOpen:false,latched:false,silentSec:0,wrapStats:{dur:this.hm(s.liveSec),peak:s.peak,tracks:s.tracksPlayed+1}}),
      wrap:s.wrapStats||{dur:'0m',peak:0,tracks:0},
      // autodj
      allItem:{bg:s.plSel==='all'?'#1D1A17':'transparent',color:s.plSel==='all'?'#F4F1EC':'#A39D94'}, selAll:()=>this.setState({plSel:'all',query:''}),
      plList, plHead, rows, noRows:rows.length===0, rowsCount:`Showing ${rows.length} of ${ids.length}`, colThird:curPl?'ADDED':'IN PLAYLISTS',
      query:s.query, onQuery:(e)=>this.setState({query:e.target.value}), autoStrip,
      openJingles:()=>this.setState({modal:'jingles'}), addTracks:()=>this.flash('Pick files, or drop them on the list'), openNewPl:()=>this.setState({modal:'newPl',plDraft:''}),
      plDraft:s.plDraft, onPlDraft:(e)=>this.setState({plDraft:e.target.value}), plDraftEmpty:!s.plDraft.trim(),
      createPl:()=>{ const name=s.plDraft.trim(); if(!name) return; const id='p'+Date.now(); this.setState(x=>({playlists:[...x.playlists,{id,name,ids:[]}],plSel:id,modal:null})); this.flash(`${name} created`); },
      jinglesOn:s.jinglesOn, toggleJingles:(v)=>this.setState({jinglesOn:v}), jingleOpts:['30 min','5 tracks'], jingleEvery:s.jingleEvery, setJingleEvery:(v)=>this.setState({jingleEvery:v}),
      jingleNote:s.jingleEvery==='30 min'?'Predictable on the clock — good for station IDs. With long tracks the gap can run a little over.':'Even spacing between songs, whatever their length.',
      jingles:s.jingles.map((j,i)=>({...j,remove:()=>this.setState(x=>({jingles:x.jingles.filter((_,k)=>k!==i)}))})), toastUpload:()=>this.flash('Pick a clip under 30 seconds'),
      // schedule
      hours, week, nowLeft, nowSlot, nextShow, save, saveSched:()=>{this.setState({dirty:false});this.flash('Schedule saved. AutoDJ follows it from now.');},
      newSlot:()=>this.setState({modal:'slot',slotDraft:{id:null,name:'',pl:'jazz',from:2,to:3,days:[todayIdx]}}),
      slot, slotPls, slotDays, fromDown:bump('from',-1), fromUp:bump('from',1), toDown:bump('to',-1), toUp:bump('to',1),
      onSlotName:(e)=>{const v=e.target.value;this.setState(x=>({slotDraft:{...x.slotDraft,name:v}}));},
      doneSlot:()=>{ const d=this.state.slotDraft; if(!d||slot.invalid) return; this.setState(x=>({slots:d.id?x.slots.map(z=>z.id===d.id?d:z):[...x.slots,{...d,id:Date.now()}],modal:null,dirty:true})); },
      deleteSlot:()=>{ const d=this.state.slotDraft; this.setState(x=>({slots:x.slots.filter(z=>z.id!==d.id),modal:null,dirty:true})); },
      // audience
      rangeOpts:['7d','30d','90d'], range:s.range, setRange:(v)=>this.setState({range:v,hoverIdx:null}), aud, hoverDay,
      howOpen:s.howOpen, howGlyph:s.howOpen?'−':'+', toggleHow:()=>this.setState({howOpen:!s.howOpen}),
      // settings
      streamRows, encRows, tips, advOpen:s.advOpen, advGlyph:s.advOpen?'−':'+', toggleAdv:()=>this.setState({advOpen:!s.advOpen}),
      showTimes, links, noLinks:s.links.length===0, linkDraft:s.linkDraft, onLinkDraft:(e)=>this.setState({linkDraft:e.target.value}), onLinkKey:(e)=>{ if(e.key==='Enter') addLink(); }, addLink,
      openDelStation:()=>this.setState({modal:'delStation',delTyped:''}),
      // account
      acct:{...s.acct,clean:s.acct.name===s.acctSaved.name&&s.acct.email===s.acctSaved.email}, onAcctName:(e)=>this.setState({acct:{...this.state.acct,name:e.target.value}}), onAcctEmail:(e)=>this.setState({acct:{...this.state.acct,email:e.target.value}}),
      saveAcct:()=>{this.setState({acctSaved:{...s.acct}});this.flash('Saved');}, toastPw:()=>this.flash('Password updated. Other sessions signed out.'), toastBilling:()=>this.flash('Billing opens in Stripe'),
      openDelAcct:()=>this.setState({modal:'delAcct',delTyped:''}),
      // modals
      hasModal:!!s.modal, modal:md, modalW:s.modal==='embed'||s.modal==='jingles'?'600px':'500px', closeModal:()=>this.setState({modal:null}), stop:(e)=>e.stopPropagation(),
      m:{edit:s.modal==='edit',qr:s.modal==='qr',embed:s.modal==='embed',share:s.modal==='share',newPl:s.modal==='newPl',jingles:s.modal==='jingles',slot:s.modal==='slot',endShow:s.modal==='endShow',del:isDel,library:s.modal==='library'},
      // responsive + files
      frame, frameRef:this.setFrame, fileRef:this.setFile, isPhone, notPhone:!isPhone, deviceOpts:['Desktop','Tablet','Phone'], deviceLabel:{desktop:'Desktop',tablet:'Tablet',phone:'Phone'}[s.device], setDevice:(v)=>{ const d=v.toLowerCase(); this.setState({device:d,drawer:false,collapsed:false,vw:d==='phone'?390:d==='tablet'?820:(this.frameRef.current?this.frameRef.current.clientWidth:window.innerWidth)}, ()=>setTimeout(()=>this.onResize&&this.onResize(),50)); }, frameLabel:frame.label,
      trackCols:isPhone?'24px minmax(0,1fr) 44px 56px':'36px minmax(0,1fr) minmax(0,190px) 60px 76px', chipDisp:isPhone?'none':'flex', rowPad:isPhone?'16px':'22px',
      bcCols:isPhone?'minmax(0,1fr) minmax(0,1fr) 32px':'minmax(150px,1.2fr) 90px minmax(0,2fr) 70px', plColMax:s.vw<760?'none':'280px', notesBtnLabel:isPhone?'Notes':'What changed',
      tabs:['Station','Studio','AutoDJ','Schedule','More'], tabValue:{overview:'Station',studio:'Studio',autodj:'AutoDJ',schedule:'Schedule'}[s.page]||'More',
      onTab:(t)=>{ if(t==='More') this.setState({drawer:true}); else this.go({Station:'overview',Studio:'studio',AutoDJ:'autodj',Schedule:'schedule'}[t]); },
      dayList, dayEmpty:dayList.length===0, dayName:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][pd], addOnDay:()=>this.setState({modal:'slot',slotDraft:{id:null,name:'',pl:'jazz',from:12,to:13,days:[pd]}}),
      queueEmpty:s.runOrder.length===0, pickFiles:()=>{ let el=this.fileRef.current; if(!el){ el=document.createElement('input'); el.type='file'; el.multiple=true; el.accept='audio/*'; el.style.display='none'; el.onchange=(e)=>this.addFiles(e.target.files); document.body.appendChild(el); this.fileRef.current=el; } el.value=''; el.click(); }, onFiles:(e)=>this.addFiles(e.target.files),
      onDragOver:(e)=>{ e.preventDefault(); if(!this.state.dragOver) this.setState({dragOver:true}); }, onDragLeave:()=>this.setState({dragOver:false}), onDrop:(e)=>{ e.preventDefault(); this.addFiles(e.dataTransfer&&e.dataTransfer.files); },
      dropOutline:s.dragOver?'1.5px dashed #F4F1EC':'0 solid transparent',
      openLibrary:()=>this.setState({modal:'library',libSel:[]}), libRows, libNone:lib.length===0, libLabel:lib.length?`Add ${lib.length} ${lib.length===1?'track':'tracks'}`:'Pick some tracks',
      addFromLib:()=>{ const add=lib.map(i=>({title:T[i][0],artist:T[i][1],sec:T[i][2]})); this.setState(x=>({runOrder:[...x.runOrder,...add],modal:null})); this.flash(`${add.length} added to your running order`); },
      openEdit:()=>this.setState({modal:'edit',draft:{...s.station}}), openQr:()=>this.setState({modal:'qr'}), openEmbed:()=>this.setState({modal:'embed'}), openShare:()=>this.setState({modal:'share'}), openPlayer:()=>this.flash('Opens gocast.fm/night-shift-radio in a new tab'),
      draft:s.draft||s.station, onDraftName:(e)=>this.setState({draft:{...this.state.draft,name:e.target.value}}), onDraftGenre:(e)=>this.setState({draft:{...this.state.draft,genre:e.target.value}}), onDraftDesc:(e)=>this.setState({draft:{...this.state.draft,desc:e.target.value}}),
      saveEdit:()=>{this.setState({station:{...this.state.draft},modal:null});this.flash('Station updated');},
      qr, toastDownload:()=>this.flash('tune-in-code.png downloaded'),
      embedCode:`<iframe\n  src="https://gocast.fm/embed/night-shift-radio"\n  title="${s.station.name} on GoCast"\n  width="100%" height="88"\n  style="border:0;border-radius:16px"\n  allow="autoplay" loading="lazy"\n></iframe>`,
      copyEmbed:()=>{this.setState({modal:null});this.flash('Embed code copied');},
      shareTargets:['Copy link','WhatsApp','Email','X / Twitter'].map(l=>({label:l,go:()=>{this.setState({modal:null});this.flash(l==='Copy link'?'Link copied':`Opening ${l}…`);}})),
      delList:s.modal==='delAcct'?['Takes every station you own off air, for good','Breaks every link and embed you’ve shared','Removes your show history and listener stats']:['Takes Night Shift Radio off air, for good','Breaks your link, tune-in code and embeds','Deletes all 12 tracks and 3 playlists'],
      delLabel:`Type ${delTarget} to confirm`, delTyped:s.delTyped, onDelTyped:(e)=>this.setState({delTyped:e.target.value}), delKeep:s.modal==='delAcct'?'Keep my account':'Keep station',
      delBtn:delOk?{bg:'#FF8177',ink:'#1A0806',cursor:'pointer'}:{bg:'rgba(244,241,236,.06)',ink:'#6F6A63',cursor:'not-allowed'},
      doDelete:()=>{ if(!delOk) return; this.setState({modal:null}); this.flash('Deleted (prototype — nothing was removed)'); }
    };
  }
}
